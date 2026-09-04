import {
  type Message as AiCoreMessage,
  type TokenUsage,
  TokenPointsExceededError,
  runAgentLoop,
} from '@ais-chat/ai-core';
import { createTextStream, encodeChatStreamEvent } from '@/utils/streaming';
import { getModelAndApiKeyWithResult, getAuxiliaryModel } from '../utils/utils';
import { getChatModelSelection } from '../utils/model-circuit-breaker';
import {
  dbGetConversationAndMessages,
  dbGetOrCreateConversation,
  dbUpdateConversationTitle,
  dbDeleteRegeneratedConversationMessage,
  dbInsertChatContent,
  dbInsertChatContentBatch,
} from '@shared/db/functions/chat';
import { dbInsertConversationUsage } from '@shared/db/functions/token-usage';
import { dbUpdateLastUsedModelByUserId } from '@shared/db/functions/user';
import { dbGetAttachedFileByEntityId, linkFilesToConversation } from '@shared/db/functions/files';
import { sendRabbitmqEvent } from '@/rabbitmq/send';
import { constructNewMessageEvent } from '@/rabbitmq/events/new-message';
import { constructTokenBudgetExceededEvent } from '@/rabbitmq/events/budget-exceeded';
import { constructChatSystemPrompt } from './system-prompt';
import {
  convertToAiCoreMessages,
  determineImageAttachmentTypeForModel,
  enrichMessagesWithImageData,
  annotateMessageAttachmentNames,
  getChatTitle,
  limitChatHistory,
} from './utils';
import { convertMessageModelToMessage } from '@/utils/chat/messages';
import { logError } from '@shared/logging';
import { ChatMessage, SendMessageResult, createErrorResult } from '@/types/chat';
import { extractUrls } from '../utils/extract-urls';
import { UserAndContext } from '@/auth/types';
import { createImageAttachmentsForConversation } from '../file-operations/preprocess-image';
import { ingestWebContent } from '../rag/ingestWebContent';
import { buildTools } from './build-tools';
import { isWebSearchEnabledForEntity } from './websearch';
import type { WebSearchResult } from '@shared/db/schema';
import type {
  AssistantSelectModel,
  CharacterSelectModel,
  LearningScenarioSelectModel,
} from '@shared/db/schema';
import type { ConversationMessageModel } from '@shared/db/types';
import { NotFoundError } from '@shared/error';
import {
  getCharacterForChatSession,
  getCharacterForExistingConversation,
} from '@shared/characters/character-service';
import {
  getLearningScenarioForChatSession,
  getLearningScenarioForExistingConversation,
} from '@shared/learning-scenarios/learning-scenario-service';
import {
  getAssistantForNewChat,
  getAssistantForExistingConversation,
} from '@shared/assistants/assistant-service';
import { deepEqual } from '@/utils/object';
import { resolveAgentNameForTracing } from '../utils/agent-name';
import { userHasReachedTokenPointsLimit } from '@shared/users/usage';

// Exports for testing
export { handleRegenerationProcessing, prepareMessageForProcessing };

type CustomChatIds = {
  characterId?: string | undefined;
  learningScenarioId?: string | undefined;
  assistantId?: string | undefined;
};

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

function ensureConversationCustomChatIdsMatch({
  incomingIds,
  storedIds,
}: {
  incomingIds: CustomChatIds;
  storedIds: CustomChatIds;
}) {
  if (!deepEqual(incomingIds, storedIds)) {
    throw new NotFoundError('Conversation not found');
  }
}

/**
 * Prepares message state for processing by handling regeneration vs new message logic.
 * Returns normalized state for the caller to use consistently.
 */
async function prepareMessageForProcessing({
  conversationId,
  userMessage,
  activeConversationMessages,
}: {
  conversationId: string;
  userMessage: ChatMessage;
  activeConversationMessages: ConversationMessageModel[];
}): Promise<{
  isRegeneration: boolean;
  conversationMessages: ConversationMessageModel[];
  userMessageOrderNumber: number;
}> {
  // In case of regeneration, we need to find the latest stored user message as the base msg.
  const latestStoredUserMsg = activeConversationMessages.find(
    (message) => message.id === userMessage.id && message.role === 'user',
  );
  const isRegeneration = latestStoredUserMsg !== undefined;

  let updatedConversationMessages = activeConversationMessages;

  if (isRegeneration && latestStoredUserMsg) {
    updatedConversationMessages = await handleRegenerationProcessing({
      conversationId,
      latestStoredUserMsg: latestStoredUserMsg,
      activeConversationMessages,
    });
  }

  const latestOrderNumber =
    updatedConversationMessages[updatedConversationMessages.length - 1]?.orderNumber ?? 0;
  const userMessageOrderNumber = latestStoredUserMsg?.orderNumber ?? latestOrderNumber + 1;

  return {
    isRegeneration,
    conversationMessages: updatedConversationMessages,
    userMessageOrderNumber,
  };
}

async function handleRegenerationProcessing({
  conversationId,
  latestStoredUserMsg,
  activeConversationMessages,
}: {
  conversationId: string;
  latestStoredUserMsg: ConversationMessageModel;
  activeConversationMessages: ConversationMessageModel[];
}): Promise<ConversationMessageModel[]> {
  await dbDeleteRegeneratedConversationMessage({
    conversationId,
    orderNumber: latestStoredUserMsg.orderNumber,
  });

  // The old regenerated messages are now soft-deleted in the DB, but activeConversationMessages still contains them until a reload.
  // We need to filter them out for the rest of the processing.
  return activeConversationMessages.filter(
    (message) => message.orderNumber <= latestStoredUserMsg.orderNumber,
  );
}

/**
 * Server Action to send a chat message and stream the response.
 * Returns a streamable value that the client can consume.
 */
export async function sendChatMessage({
  conversationId,
  messages,
  modelId,
  characterId,
  learningScenarioId,
  assistantId,
  fileIds,
  user,
}: {
  conversationId: string;
  messages: ChatMessage[];
  modelId: string;
  characterId?: string;
  learningScenarioId?: string;
  assistantId?: string;
  fileIds?: string[];
  user: UserAndContext;
}): Promise<SendMessageResult> {
  // Get model and API key
  const [error, modelAndApiKey] = await getModelAndApiKeyWithResult({
    modelId,
    federalStateId: user.federalState.id,
  });

  if (error !== null) {
    throw new Error(error.message);
  }

  const { model: definedModel, apiKeyId } = modelAndApiKey;
  const modelSelection = await getChatModelSelection({
    model: definedModel,
    federalStateId: user.federalState.id,
  });

  // Get auxiliary model for title generation
  const auxiliaryModel = await getAuxiliaryModel(user.federalState.id);
  const [errorAux, auxiliaryModelAndApiKey] = await getModelAndApiKeyWithResult({
    modelId: auxiliaryModel.id,
    federalStateId: user.federalState.id,
  });

  if (errorAux !== null) {
    throw new Error(errorAux.message);
  }

  const activeAuxiliaryModelAndApiKey = auxiliaryModelAndApiKey;

  let activeCharacter: CharacterSelectModel | undefined;
  let activeLearningScenario: LearningScenarioSelectModel | undefined;
  let activeAssistant: AssistantSelectModel | undefined;

  const existingConversationObject = await dbGetConversationAndMessages({
    conversationId,
    userId: user.id,
  });

  if (existingConversationObject !== undefined) {
    ensureConversationCustomChatIdsMatch({
      incomingIds: { characterId, learningScenarioId, assistantId },
      storedIds: {
        characterId: existingConversationObject.conversation.characterId ?? undefined,
        learningScenarioId: existingConversationObject.conversation.learningScenarioId ?? undefined,
        assistantId: existingConversationObject.conversation.assistantId ?? undefined,
      },
    });
  }

  if (characterId !== undefined) {
    activeCharacter = existingConversationObject
      ? await getCharacterForExistingConversation({
          characterId,
          conversationId,
          user,
        })
      : await getCharacterForChatSession({ characterId, user });

    if (activeCharacter.suspended) {
      throw new NotFoundError('Character not found');
    }
  }

  if (learningScenarioId !== undefined) {
    activeLearningScenario = existingConversationObject
      ? await getLearningScenarioForExistingConversation({
          learningScenarioId,
          conversationId,
          user,
        })
      : await getLearningScenarioForChatSession({ learningScenarioId, user });

    if (activeLearningScenario.suspended) {
      throw new NotFoundError('Learning scenario not found');
    }
  }

  if (assistantId !== undefined) {
    activeAssistant = existingConversationObject
      ? await getAssistantForExistingConversation({ assistantId, conversationId, user })
      : await getAssistantForNewChat({ assistantId, user });

    if (activeAssistant.suspended) {
      throw new NotFoundError('Assistant not found');
    }
  }

  // Get or create conversation
  const conversation = await dbGetOrCreateConversation({
    conversationId,
    userId: user.id,
    characterId,
    learningScenarioId,
    assistantId,
  });

  if (conversation === undefined) {
    throw new Error('Could not get or create conversation');
  }

  const activeConversation = conversation;

  const conversationObject =
    existingConversationObject ??
    (await dbGetConversationAndMessages({
      conversationId: activeConversation.id,
      userId: user.id,
    }));

  if (conversationObject === undefined) {
    throw new Error('Could not get conversation object');
  }

  const activeConversationObject = conversationObject;

  ensureConversationCustomChatIdsMatch({
    incomingIds: { characterId, learningScenarioId, assistantId },
    storedIds: {
      characterId: activeConversation.characterId ?? undefined,
      learningScenarioId: activeConversation.learningScenarioId ?? undefined,
      assistantId: activeConversation.assistantId ?? undefined,
    },
  });

  // Check budget limit after we have the conversation for proper event tracking
  if (await userHasReachedTokenPointsLimit({ user })) {
    await sendRabbitmqEvent(
      constructTokenBudgetExceededEvent({
        anonymous: false,
        user,
        conversation,
      }),
    );
    return createErrorResult(new TokenPointsExceededError());
  }

  // Get the user message (last message should be from user)
  const userMessage = messages[messages.length - 1];
  if (!userMessage || userMessage.role !== 'user') {
    throw new Error('No user message found');
  }

  const activeUserMessage = userMessage;

  const {
    isRegeneration,
    conversationMessages: activeConversationMessages,
    userMessageOrderNumber,
  } = await prepareMessageForProcessing({
    conversationId: activeConversation.id,
    userMessage: activeUserMessage,
    activeConversationMessages: activeConversationObject.messages,
  });

  if (!isRegeneration) {
    await dbInsertChatContent({
      conversationId: activeConversation.id,
      id: userMessage.id,
      content: userMessage.content,
      role: 'user',
      userId: user.id,
      modelName: modelSelection.modelName,
      orderNumber: userMessageOrderNumber,
    });
  }

  // Link files to conversation
  if (fileIds && fileIds.length > 0) {
    await linkFilesToConversation({
      fileIds,
      conversationMessageId: userMessage.id,
      conversationId: conversation.id,
    });
  }

  // Get related files and content
  const relatedFileEntities = await dbGetAttachedFileByEntityId({
    conversationId: conversation.id,
    characterId,
    learningScenarioId,
    assistantId,
  });
  let webSearchResults: WebSearchResult[] = [];

  const urls = extractUrls({
    assistant: activeAssistant,
    character: activeCharacter,
    learningScenario: activeLearningScenario,
  });
  const ingestResult = await ingestWebContent({
    urls,
    federalStateId: user.federalState.id,
  });

  const attachedLinks =
    activeAssistant?.attachedLinks ??
    activeCharacter?.attachedLinks ??
    activeLearningScenario?.attachedLinks ??
    [];

  const allowWebTools = isWebSearchEnabledForEntity({
    featureToggles: user.federalState.featureToggles,
    entity: activeCharacter ??
      activeLearningScenario ??
      activeAssistant ?? { isWebSearchEnabled: true },
  });

  const { stream, signal: generationSignal, update, done, error: streamError } = createTextStream();

  const tools = await buildTools({
    user,
    characterId,
    learningScenarioId,
    assistantId,
    conversationId: activeConversation.id,
    webSearchSettings: activeCharacter ?? activeLearningScenario ?? activeAssistant,
    relatedFileEntities,
    attachedLinks,
    sourceUrls: ingestResult.processedUrls,
    allowWebTools,
    allowMundoSearch: true,
    isCalculatorEnabled: user.federalState.featureToggles.isCalculatorEnabled,
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

  // Update last used model
  await dbUpdateLastUsedModelByUserId({ modelName: definedModel.name, userId: user.id });

  // Use DB messages as source of truth — they include intermediate tool call/result
  // messages from the agent loop that the client doesn't track
  const fullMessages: ChatMessage[] = isRegeneration
    ? convertMessageModelToMessage(activeConversationMessages)
    : [...convertMessageModelToMessage(activeConversationMessages), userMessage];

  // Prune messages
  const prunedMessages = limitChatHistory(
    annotateMessageAttachmentNames(fullMessages, relatedFileEntities),
  );

  // Build system prompt
  const systemPrompt = constructChatSystemPrompt({
    character: activeCharacter,
    learningScenario: activeLearningScenario,
    assistant: activeAssistant,
    isTeacher: user.userRole === 'teacher',
    federalState: user.federalState,
    activeToolDefinitions: Object.values(tools.toolRegistry).map((entry) => entry.definition),
  });

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

  const assistantMessageId = crypto.randomUUID();
  const assistantMessageOrderNumber = userMessageOrderNumber + 1;

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
        userId: user.id,
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
        userId: user.id,
        orderNumber: assistantMessageOrderNumber + persistedAgentLoopMessages.length,
        modelName: definedModel.name,
        conversationId: activeConversation.id,
        webSearchResults,
      },
    ];

    await dbInsertChatContentBatch(messagesToInsert);

    if (messages.length <= 2 || activeConversation.name === null) {
      const chatTitle = await getChatTitle({
        modelId: auxiliaryModel.id,
        apiKeyId: activeAuxiliaryModelAndApiKey.apiKeyId,
        message: activeUserMessage,
      });
      await dbUpdateConversationTitle({
        name: chatTitle,
        conversationId: activeConversation.id,
        userId: user.id,
      });
    }

    const { promptTokens, completionTokens } = usage;

    // Agentic requests can invoke several models across iterations. Persist each usage
    // entry separately so pricing and reporting stay associated with the serving model.
    await Promise.all(
      modelUsages.map((modelUsage) =>
        dbInsertConversationUsage({
          conversationId: activeConversation.id,
          userId: user.id,
          modelId: modelUsage.modelId,
          completionTokens: modelUsage.usage.completionTokens,
          promptTokens: modelUsage.usage.promptTokens,
          costsInCent: modelUsage.priceInCents,
        }),
      ),
    );

    await sendRabbitmqEvent(
      constructNewMessageEvent({
        user,
        promptTokens,
        completionTokens,
        costsInCent: priceInCents,
        provider: definedModel.provider,
        anonymous: false,
        conversation: activeConversation,
      }),
    );
  }

  async function persistEmptyAssistantMessage() {
    await dbInsertChatContent({
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      userId: user.id,
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
    agentName: resolveAgentNameForTracing({ characterId, learningScenarioId, assistantId }),
    abortSignal: generationSignal,
    onTextChunk: (delta: string) => {
      update(delta);
    },
    onComplete: async ({ fullText, usage, priceInCents, modelUsages, agentLoopMessages }) => {
      try {
        await persistAssistantMessage({
          fullText,
          usage,
          priceInCents,
          modelUsages,
          agentLoopMessages,
        });
        done();
      } catch (error) {
        logError('Error during agent loop completion:', error);
        streamError(error instanceof Error ? error : new Error('Unknown error'));
      }
    },
    onError: async (error: Error) => {
      await persistEmptyAssistantMessage();

      streamError(error);
    },
  });

  return {
    stream,
    messageId: assistantMessageId,
    webSearchResults,
  };
}
