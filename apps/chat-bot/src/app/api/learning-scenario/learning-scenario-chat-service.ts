import {
  TokenPointsExceededError,
  SharedChatExpiredError,
  runAgentLoop,
  type TokenUsage,
  type Message as AiCoreMessage,
} from '@ais-chat/ai-core';
import { NotFoundError } from '@shared/error';
import { createTextStream, encodeChatStreamEvent } from '@/utils/streaming';
import { createAiActivityStream } from '../chat/ai-activity-stream';
import { getUserAndContextByUserId } from '@/auth/utils';
import { checkProductAccess } from '@/utils/vidis/access';
import { getModelAndApiKeyWithResult } from '../utils/utils';
import { getChatModelSelection } from '../utils/model-circuit-breaker';
import {
  dbGetLearningScenarioByIdAndInviteCode,
  dbUpdateTokenUsageBySharedLearningScenarioId,
} from '@shared/db/functions/learning-scenario';
import { dbGetRelatedLearningScenarioFiles } from '@shared/db/functions/files';
import {
  dbGetOrCreateConversation,
  dbGetConversationAndMessages,
  dbInsertChatContent,
  dbInsertChatContentBatch,
} from '@shared/db/functions/chat';
import { dbInsertConversationUsage } from '@shared/db/functions/token-usage';
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
import { convertMessageModelToMessage } from '@/utils/chat/messages';
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
import type { WebSearchResult } from '@shared/db/schema';

function filterPersistedAgentLoopMessages(agentLoopMessages: AiCoreMessage[]) {
  const excludedToolCallIds = new Set<string>();

  return agentLoopMessages.flatMap((message) => {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      const retainedToolCalls = message.toolCalls.filter((toolCall) => {
        if (toolCall.name === 'retrieve_entire_file') {
          excludedToolCallIds.add(toolCall.id);
          return false;
        }

        return true;
      });

      if (retainedToolCalls.length === 0 && message.content.trim().length === 0) {
        return [];
      }

      return [
        {
          ...message,
          toolCalls: retainedToolCalls.length > 0 ? retainedToolCalls : undefined,
        },
      ];
    }

    if (
      message.role === 'tool' &&
      message.toolCallId &&
      excludedToolCallIds.has(message.toolCallId)
    ) {
      return [];
    }

    return [message];
  });
}

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

  // Create or get conversation for this shared learning scenario
  const conversation = await dbGetOrCreateConversation({
    conversationId: sharedSessionId || crypto.randomUUID(),
    userId: teacherUserAndContext.id,
    learningScenarioId,
  });

  if (conversation === undefined) {
    throw new Error('Could not get or create conversation');
  }

  const activeConversation = conversation;

  // Load existing messages from database
  const conversationObject = await dbGetConversationAndMessages({
    conversationId: activeConversation.id,
    userId: teacherUserAndContext.id,
  });

  if (conversationObject === undefined) {
    throw new Error('Could not get conversation object');
  }

  const existingMessages = conversationObject.messages;
  const latestOrderNumber = existingMessages[existingMessages.length - 1]?.orderNumber ?? 0;
  const userMessageOrderNumber = latestOrderNumber + 1;
  const assistantMessageOrderNumber = userMessageOrderNumber + 1;

  // Get the user message (last message should be from user)
  const userMessage = messages[messages.length - 1];
  if (!userMessage || userMessage.role !== 'user') {
    throw new Error('No user message found');
  }

  // Store user message in database
  await dbInsertChatContent({
    conversationId: activeConversation.id,
    id: userMessage.id,
    content: userMessage.content,
    role: 'user',
    userId: teacherUserAndContext.id,
    modelName: modelSelection.modelName,
    orderNumber: userMessageOrderNumber,
  });

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
      webSearchResults = results;
      update(
        encodeChatStreamEvent({
          type: 'web_search_results',
          webSearchResults: results,
        }),
      );
    },
  });
  const aiActivity = createAiActivityStream(update, tools.toolRegistry);

  // Build system prompt
  const systemPrompt = constructLearningScenarioSystemPrompt({
    learningScenario: learningScenario,
    activeToolDefinitions: Object.values(tools.toolRegistry).map((entry) => entry.definition),
  });

  // Build full message history from database + new user message
  const fullMessages: ChatMessage[] = [
    ...convertMessageModelToMessage(existingMessages),
    userMessage,
  ];

  // Prune messages
  const prunedMessages = limitChatHistory(
    annotateMessageAttachmentNames(fullMessages, relatedFileEntities),
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

  let webSearchResults: WebSearchResult[] = [];

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

      // Also persist to conversation usage table for consistency with regular chats
      await dbInsertConversationUsage({
        conversationId: activeConversation.id,
        userId: teacherUserAndContext.id,
        modelId: modelUsage.modelId,
        completionTokens: modelUsage.usage.completionTokens,
        promptTokens: modelUsage.usage.promptTokens,
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

  async function persistAssistantMessage({
    fullText,
    usage,
    priceInCents,
    agentLoopMessages,
    modelUsages,
  }: {
    fullText: string;
    usage: TokenUsage;
    priceInCents: number;
    agentLoopMessages: AiCoreMessage[];
    modelUsages: Array<{ modelId: string; usage: TokenUsage; priceInCents: number }>;
  }) {
    const persistedAgentLoopMessages = filterPersistedAgentLoopMessages(agentLoopMessages);

    // Persist intermediate tool call/result messages and the final assistant message in one query
    const messagesToInsert = [
      ...persistedAgentLoopMessages.map((msg, index) => ({
        content: msg.content,
        role: msg.role,
        userId: teacherUserAndContext.id,
        orderNumber: assistantMessageOrderNumber + index,
        modelName: definedModel.name,
        conversationId: activeConversation.id,
        toolCalls: msg.toolCalls ?? null,
        toolCallId: msg.toolCallId ?? null,
      })),
      {
        id: assistantMessageId,
        content: fullText,
        role: 'assistant' as const,
        userId: teacherUserAndContext.id,
        orderNumber: assistantMessageOrderNumber + persistedAgentLoopMessages.length,
        modelName: definedModel.name,
        conversationId: activeConversation.id,
        webSearchResults,
        aiActivity: aiActivity.getSteps(),
      },
    ];

    await dbInsertChatContentBatch(messagesToInsert);
    await persistUsage({ usage, priceInCents, modelUsages });
  }

  async function persistEmptyAssistantMessage() {
    await dbInsertChatContent({
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      userId: teacherUserAndContext.id,
      orderNumber: assistantMessageOrderNumber,
      modelName: definedModel.name,
      conversationId: activeConversation.id,
    });
  }

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
    onToolCalls: (toolCalls) => {
      // Stream tool calls to client for real-time display
      update(
        encodeChatStreamEvent({
          type: 'tool_calls',
          toolCalls,
        }),
      );
      // Also track in AI activity
      aiActivity.onToolCalls(toolCalls);
    },
    onToolResult: (toolCallId, result) => {
      // Stream tool result to client
      update(
        encodeChatStreamEvent({
          type: 'tool_result',
          toolCallId,
          content: result,
        }),
      );
      // Also track in AI activity
      aiActivity.onToolResult(toolCallId, result);
    },
    onComplete: async ({ fullText, usage, priceInCents, modelUsages, agentLoopMessages }) => {
      try {
        aiActivity.finish();
        await persistAssistantMessage({
          fullText,
          usage,
          priceInCents,
          modelUsages,
          agentLoopMessages: agentLoopMessages ?? [],
        });
        done();
      } catch (persistError) {
        logError('Error during learning scenario message persistence:', persistError);
        streamError(persistError instanceof Error ? persistError : new Error('Unknown error'));
      }
    },
    onError: async (error, billedUsage) => {
      logError('Error during shared chat streaming:', error);
      try {
        await persistEmptyAssistantMessage();
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
