import { getUserAndContextByUserId } from '@/auth/utils';
import { constructTokenBudgetExceededEvent } from '@/rabbitmq/events/budget-exceeded';
import { constructNewMessageEvent } from '@/rabbitmq/events/new-message';
import { sendRabbitmqEvent } from '@/rabbitmq/send';
import { ChatMessage, SendMessageResult, createErrorResult } from '@/types/chat';
import { createTextStream } from '@/utils/streaming';
import { checkProductAccess } from '@/utils/vidis/access';
import {
  ResponsibleAIError,
  SharedChatExpiredError,
  TokenPointsExceededError,
  runAgentLoop,
  type TokenUsage,
} from '@ais-chat/ai-core';
import { dbGetRelatedLearningScenarioFiles } from '@shared/db/functions/files';
import {
  dbGetLearningScenarioByIdAndInviteCode,
  dbUpdateTokenUsageBySharedLearningScenarioId,
} from '@shared/db/functions/learning-scenario';
import { NotFoundError } from '@shared/error';
import { logError } from '@shared/logging';
import {
  sharedChatHasExpired,
  sharedLearningScenarioChatHasReachedTokenPointsLimit,
  userHasReachedTokenPointsLimit,
} from '@shared/users/usage';
import { createAiActivityStream } from '../chat/ai-activity-stream';
import { buildTools } from '../chat/build-tools';
import { prepareAgentMessages } from '../chat/prepare-agent-messages';
import {
  annotateMessageAttachmentNames,
  convertToAiCoreMessages,
  getMostRecentUserMessage,
  limitChatHistory,
} from '../chat/utils';
import { isWebSearchEnabledForEntity } from '../chat/websearch';
import { ingestWebContent } from '../rag/ingestWebContent';
import { combineSharedRelatedFiles } from '../shared-chat/shared-chat-file-service';
import { resolveAgentNameForTracing } from '../utils/agent-name';
import { extractUrls } from '../utils/extract-urls';
import { getChatModelSelection } from '../utils/model-circuit-breaker';
import { getModelAndApiKeyWithResult, getSafetyModel } from '../utils/utils';
import { constructLearningScenarioSystemPrompt } from './system-prompt';

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
  const safetyModel = await getSafetyModel();

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

  const allowWebTools = isWebSearchEnabledForEntity({
    featureToggles: teacherUserAndContext.federalState.featureToggles,
    entity: learningScenario,
  });

  // Prune messages
  const prunedMessages = limitChatHistory(
    annotateMessageAttachmentNames(messages, relatedFileEntities),
  );

  let messagesWithImages: ChatMessage[];
  try {
    messagesWithImages = await prepareAgentMessages({
      messages: prunedMessages,
      relatedFileEntities,
      model: definedModel,
      modelSelection,
      safetyModelName: safetyModel?.name,
      apiKeyId,
    });
  } catch (error) {
    if (ResponsibleAIError.is(error)) {
      return createErrorResult(error);
    }
    throw error;
  }

  const { stream, signal: generationSignal, update, done, error: streamError } = createTextStream();
  const assistantMessageId = crypto.randomUUID();

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
    modelId,
    apiKeyId,
  });

  const aiActivity = createAiActivityStream(update, tools.toolRegistry, {
    hideSensitiveDetails: true,
  });

  // Build system prompt
  const systemPrompt = constructLearningScenarioSystemPrompt({
    learningScenario: learningScenario,
    activeToolDefinitions: Object.values(tools.toolRegistry).map((entry) => entry.definition),
  });

  const persistUsage = async ({
    usage,
    priceInCents,
    modelUsages,
  }: {
    usage: TokenUsage;
    priceInCents: number;
    modelUsages: Array<{ modelId: string; usage: TokenUsage; priceInCents: number }>;
  }) => {
    if (modelUsages.length === 0) {
      return;
    }

    // Agentic requests can invoke several models across iterations. Persist each usage
    // entry separately so pricing and reporting stay associated with the serving model.
    for (const modelUsage of modelUsages) {
      await dbUpdateTokenUsageBySharedLearningScenarioId({
        modelId: modelUsage.modelId,
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
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costsInCent: priceInCents,
        anonymous: true,
        sharedChat: learningScenario,
      }),
    );
  };

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
    onReasoningSummary: aiActivity.onReasoningSummary,
    onToolCalls: aiActivity.onToolCalls,
    onToolResult: aiActivity.onToolResult,
    onComplete: async ({ usage, priceInCents, modelUsages }) => {
      aiActivity.finish();
      await persistUsage({ usage, priceInCents, modelUsages });

      done();
    },
    onError: async (error, billedUsage) => {
      logError('Error during shared chat streaming:', error);
      try {
        await persistUsage(billedUsage);
      } catch (persistenceError) {
        logError('Error persisting failed shared chat usage:', persistenceError);
      } finally {
        streamError(error);
      }
    },
  });

  return {
    stream,
    messageId: assistantMessageId,
  };
}
