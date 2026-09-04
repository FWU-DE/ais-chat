import { TokenPointsExceededError, SharedChatExpiredError, runAgentLoop } from '@ais-chat/ai-core';
import { NotFoundError } from '@shared/error';
import { createTextStream, encodeChatStreamEvent } from '@/utils/streaming';
import { getUserAndContextByUserId } from '@/auth/utils';
import { checkProductAccess } from '@/utils/vidis/access';
import { getModelAndApiKeyWithResult } from '../utils/utils';
import { getChatModelSelection } from '../utils/model-circuit-breaker';
import {
  dbGetLearningScenarioByIdAndInviteCode,
  dbUpdateTokenUsageBySharedLearningScenarioId,
} from '@shared/db/functions/learning-scenario';
import { dbGetRelatedLearningScenarioFiles } from '@shared/db/functions/files';
import { sendRabbitmqEvent } from '@/rabbitmq/send';
import { constructNewMessageEvent } from '@/rabbitmq/events/new-message';
import { constructTokenBudgetExceededEvent } from '@/rabbitmq/events/budget-exceeded';
import { constructLearningScenarioSystemPrompt } from './system-prompt';
import {
  convertToAiCoreMessages,
  determineImageAttachmentTypeForModel,
  enrichMessagesWithImageData,
  getMostRecentUserMessage,
  limitChatHistory,
  annotateMessageAttachmentNames,
} from '../chat/utils';
import { logError } from '@shared/logging';
import { buildTools } from '../chat/build-tools';
import { isWebSearchEnabledForEntity } from '../chat/websearch';
import { ChatMessage, SendMessageResult, createErrorResult } from '@/types/chat';
import { createImageAttachmentsForConversation } from '../file-operations/preprocess-image';
import { ingestWebContent } from '../rag/ingestWebContent';
import { resolveAgentNameForTracing } from '../utils/agent-name';
import { extractUrls } from '../utils/extract-urls';
import { combineSharedRelatedFiles } from '../shared-chat/shared-chat-file-service';
import {
  sharedChatHasExpired,
  sharedLearningScenarioChatHasReachedTokenPointsLimit,
  userHasReachedTokenPointsLimit,
} from '@shared/users/usage';

/**
 * Server Action to send a learning scenario message and stream the response.
 */
export async function sendLearningScenarioMessage({
  learningScenarioId,
  inviteCode,
  messages,
  modelId,
  fileIds,
  sharedSessionId,
}: {
  learningScenarioId: string;
  inviteCode: string;
  messages: ChatMessage[];
  modelId: string;
  fileIds?: string[];
  sharedSessionId?: string;
}): Promise<SendMessageResult> {
  // Get learning scenario
  const learningScenario = await dbGetLearningScenarioByIdAndInviteCode({
    learningScenarioId,
    inviteCode,
  });
  if (learningScenario === undefined || learningScenario.suspended) {
    return createErrorResult(new NotFoundError('Learning scenario not found'));
  }

  // Get teacher user context
  const teacherUserAndContext = await getUserAndContextByUserId({
    userId: learningScenario.startedBy,
  });
  const productAccess = checkProductAccess(teacherUserAndContext);

  if (!productAccess.hasAccess) {
    throw new Error(productAccess.errorType);
  }

  if (teacherUserAndContext.userRole !== 'teacher') {
    throw new Error('The user assigned to this chat is not a teacher');
  }

  // Get model and API key
  const [error, modelAndApiKey] = await getModelAndApiKeyWithResult({
    modelId,
    federalStateId: teacherUserAndContext.federalState.id,
  });

  if (error !== null) {
    throw new Error(error.message);
  }

  const { model: definedModel, apiKeyId } = modelAndApiKey;
  const modelSelection = await getChatModelSelection({
    model: definedModel,
    federalStateId: teacherUserAndContext.federalState.id,
  });
  const generationModelId = modelSelection.modelIds[0];

  // Check expiry
  if (sharedChatHasExpired(learningScenario)) {
    return createErrorResult(new SharedChatExpiredError());
  }

  // Check limits
  const [sharedChatLimitReached, tokenPointsLimitReached] = await Promise.all([
    sharedLearningScenarioChatHasReachedTokenPointsLimit({
      user: teacherUserAndContext,
      learningScenario: learningScenario,
    }),
    userHasReachedTokenPointsLimit({ user: teacherUserAndContext }),
  ]);

  if (tokenPointsLimitReached) {
    await sendRabbitmqEvent(
      constructTokenBudgetExceededEvent({
        anonymous: true,
        user: teacherUserAndContext,
        sharedChat: learningScenario,
      }),
    );
  }

  if (sharedChatLimitReached || tokenPointsLimitReached) {
    return createErrorResult(new TokenPointsExceededError());
  }

  // Get related files and web sources
  const relatedFileEntities = await combineSharedRelatedFiles({
    relatedFileEntities: await dbGetRelatedLearningScenarioFiles(learningScenario.id),
    fileIds,
    inviteCode,
    entityType: 'learningScenario',
    entityId: learningScenarioId,
    sharedSessionId,
    userMessageId: getMostRecentUserMessage(messages)?.id,
  });
  const urls = extractUrls({
    learningScenario,
  });
  const { processedUrls } = await ingestWebContent({
    urls,
    federalStateId: teacherUserAndContext.federalState.id,
  });

  const { stream, signal: generationSignal, update, done, error: streamError } = createTextStream();
  const assistantMessageId = crypto.randomUUID();

  const allowWebTools = isWebSearchEnabledForEntity({
    featureToggles: teacherUserAndContext.federalState.featureToggles,
    entity: learningScenario,
  });

  const tools = await buildTools({
    user: teacherUserAndContext,
    learningScenarioId: learningScenario.id,
    webSearchSettings: learningScenario,
    relatedFileEntities,
    attachedLinks: learningScenario.attachedLinks,
    sourceUrls: processedUrls,
    allowWebTools,
    allowMundoSearch: false,
    isCalculatorEnabled: teacherUserAndContext.federalState.featureToggles.isCalculatorEnabled,
    onWebSearchResults: (results) => {
      update(
        encodeChatStreamEvent({
          type: 'web_search_results',
          webSearchResults: results,
        }),
      );
    },
  });

  // Build system prompt
  const systemPrompt = constructLearningScenarioSystemPrompt({
    learningScenario: learningScenario,
    activeToolDefinitions: Object.values(tools.toolRegistry).map((entry) => entry.definition),
  });

  // Prune messages
  const prunedMessages = limitChatHistory(
    annotateMessageAttachmentNames(messages, relatedFileEntities),
  );

  // Check if the model supports images based on supportedImageFormats
  const modelSupportsImages =
    definedModel.supportedImageFormats !== null && definedModel.supportedImageFormats.length > 0;

  const imageAttachmentType = determineImageAttachmentTypeForModel(definedModel);

  // attach the image url to each of the image files within relatedFileEntities
  const extractedImages = await createImageAttachmentsForConversation(
    relatedFileEntities,
    imageAttachmentType,
  );

  // Format messages with images if the model supports vision
  const messagesWithImages = enrichMessagesWithImageData(
    prunedMessages,
    extractedImages,
    modelSupportsImages,
    imageAttachmentType,
  );

  runAgentLoop({
    modelSelection,
    apiKeyId,
    messages: convertToAiCoreMessages(systemPrompt, messagesWithImages),
    toolRegistry: tools.toolRegistry,
    agentName: resolveAgentNameForTracing({ learningScenarioId: learningScenario.id }),
    abortSignal: generationSignal,
    onTextChunk: (delta) => {
      update(delta);
    },
    onComplete: async ({ usage, priceInCents, modelUsages }) => {
      const { promptTokens, completionTokens } = usage;

      // Agentic requests can invoke several models across iterations. Persist each usage
      // entry separately so pricing and reporting stay associated with the serving model.
      for (const modelUsage of modelUsages) {
        await dbUpdateTokenUsageBySharedLearningScenarioId({
          modelId: modelUsage.modelId ?? generationModelId,
          completionTokens: modelUsage.usage.completionTokens,
          promptTokens: modelUsage.usage.promptTokens,
          learningScenarioId: learningScenario.id,
          userId: teacherUserAndContext.id,
          costsInCent: modelUsage.priceInCents,
        });
      }

      await sendRabbitmqEvent(
        constructNewMessageEvent({
          user: teacherUserAndContext,
          provider: definedModel.provider,
          promptTokens,
          completionTokens,
          costsInCent: priceInCents,
          anonymous: true,
          sharedChat: learningScenario,
        }),
      );

      done();
    },
    onError: (error) => {
      logError('Error during shared chat streaming:', error);
      streamError(error);
    },
  });

  return {
    stream,
    messageId: assistantMessageId,
  };
}
