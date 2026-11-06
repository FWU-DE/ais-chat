import type { Message as AiCoreMessage } from '@ais-chat/ai-core';
import { dbGetFilesInIds, linkFilesToSharedChatMessage } from '@shared/db/functions/files';
import {
  dbDeleteRegeneratedSharedChatMessages,
  dbGetOrCreateSharedChatConversation,
  dbGetSharedChatConversation,
  dbGetSharedChatConversationMessageFileIds,
  dbGetSharedChatConversationMessages,
  dbGetSharedChatFileConversationIds,
  dbInsertSharedChatContent,
  dbInsertSharedChatContentBatch,
} from '@shared/db/functions/shared-chat-conversation';
import { ForbiddenError, InvalidArgumentError } from '@shared/error';
import { verify } from '@shared/shared-chat';
import { isToolRelatedMessage } from '@shared/utils/tool-related-message';

import type { ChatMessage } from '@/types/chat';

type SharedChatFile = { id: string; name: string; type: string; size: number };

export type SharedChatConversationHistory = {
  messages: ChatMessage[];
  filesByMessageId: Array<{ messageId: string; files: SharedChatFile[] }>;
};

export async function loadSharedChatConversationMessages({
  sharedSessionId,
  inviteCode,
  entityType,
  entityId,
}: {
  sharedSessionId: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
}): Promise<SharedChatConversationHistory> {
  const conversation = await dbGetSharedChatConversation({
    conversationId: sharedSessionId,
    inviteCode,
    entityType,
    entityId,
  });
  if (conversation === undefined) {
    return { messages: [], filesByMessageId: [] };
  }

  const messages = await dbGetSharedChatConversationMessages(conversation.id);
  const messageFileIds = await dbGetSharedChatConversationMessageFileIds(conversation.id);
  const fileIds = messageFileIds.map((mapping) => mapping.fileId);
  const files = await dbGetFilesInIds([...new Set(fileIds)]);
  const filesById = new Map(
    files.map((file) => [
      file.id,
      { id: file.id, name: file.name, type: file.type, size: file.size },
    ]),
  );

  return {
    messages: messages
      .filter((message) => !isToolRelatedMessage(message))
      .map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
    filesByMessageId: [...new Set(messageFileIds.map((mapping) => mapping.messageId))].map(
      (messageId) => ({
        messageId,
        files: messageFileIds
          .filter((mapping) => mapping.messageId === messageId)
          .map((mapping) => mapping.fileId)
          .map((fileId) => filesById.get(fileId))
          .filter((file): file is NonNullable<typeof file> => file !== undefined),
      }),
    ),
  };
}

export async function prepareSharedChatConversation({
  sharedSessionId,
  inviteCode,
  entityType,
  entityId,
  initialMessage,
  clientMessages,
  fileIds,
}: {
  sharedSessionId?: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  initialMessage?: string | null;
  clientMessages: ChatMessage[];
  fileIds?: string[];
}) {
  if (sharedSessionId === undefined || sharedSessionId.trim() === '') {
    throw new ForbiddenError('Not authorized to access this shared chat conversation');
  }

  const currentUserMessage = clientMessages.findLast((message) => message.role === 'user');
  if (currentUserMessage === undefined) {
    throw new InvalidArgumentError('A user message is required');
  }

  const conversation = await dbGetOrCreateSharedChatConversation({
    conversationId: sharedSessionId,
    inviteCode,
    entityType,
    entityId,
  });
  if (conversation === undefined) {
    throw new ForbiddenError('Not authorized to access this shared chat conversation');
  }

  const currentFileIds = [...new Set(fileIds ?? [])];
  if (currentFileIds.length > 0) {
    const uploadedFiles = await dbGetFilesInIds(currentFileIds);
    if (uploadedFiles.length !== currentFileIds.length) {
      throw new ForbiddenError('Not authorized to access this file');
    }
    verify.filesDoNotBelongToAnyUser(uploadedFiles);
    const mappedHere = new Set(
      (await dbGetSharedChatFileConversationIds(currentFileIds))
        .filter((mapping) => mapping.conversationId === sharedSessionId)
        .map((mapping) => mapping.fileId),
    );
    if (currentFileIds.some((fileId) => !mappedHere.has(fileId))) {
      throw new ForbiddenError('Not authorized to access this file');
    }
  }

  const { previousMessages, userMessageOrderNumber } = await prepareSharedChatMessageForProcessing({
    conversationId: sharedSessionId,
    userMessage: currentUserMessage,
    fileIds: currentFileIds,
  });
  const storedFileIds = (await dbGetSharedChatConversationMessageFileIds(sharedSessionId)).map(
    (mapping) => mapping.fileId,
  );

  // The opener is not stored in the conversation; it always comes from the entity.
  const openingMessages: ChatMessage[] = initialMessage
    ? [{ id: 'initial-message', role: 'assistant', content: initialMessage }]
    : [];

  return {
    messages: [...openingMessages, ...previousMessages, currentUserMessage],
    fileIds: [...new Set([...currentFileIds, ...storedFileIds])],
    persistResponse: async ({
      assistantMessageId,
      fullText,
      agentLoopMessages,
    }: {
      assistantMessageId: string;
      fullText: string;
      agentLoopMessages: AiCoreMessage[];
    }) => {
      const messagesToPersist = [
        ...agentLoopMessages.map((message) => ({
          id: crypto.randomUUID(),
          conversationId: sharedSessionId,
          ...message,
          content: message.content,
          role: message.role,
          toolCalls: message.toolCalls ?? null,
          toolCallId: message.toolCallId ?? null,
        })),
        {
          id: assistantMessageId,
          conversationId: sharedSessionId,
          role: 'assistant' as const,
          content: fullText,
          toolCalls: null,
          toolCallId: null,
        },
      ];

      await dbInsertSharedChatContentBatch(
        messagesToPersist.map((message, index) => ({
          ...message,
          orderNumber: userMessageOrderNumber + 1 + index,
        })),
      );
    },
  };
}

/**
 * Handles a regeneration of an already stored user message, stores a new one and links its files.
 */
async function prepareSharedChatMessageForProcessing({
  conversationId,
  userMessage,
  fileIds,
}: {
  conversationId: string;
  userMessage: ChatMessage;
  fileIds: string[];
}): Promise<{ previousMessages: ChatMessage[]; userMessageOrderNumber: number }> {
  const storedMessages = await dbGetSharedChatConversationMessages(conversationId);
  const storedUserMessage = storedMessages.find(
    (message) => message.id === userMessage.id && message.role === 'user',
  );

  let userMessageOrderNumber: number;
  if (storedUserMessage !== undefined) {
    userMessageOrderNumber = storedUserMessage.orderNumber;
    await dbDeleteRegeneratedSharedChatMessages({
      conversationId,
      orderNumber: userMessageOrderNumber,
    });
  } else {
    userMessageOrderNumber = (storedMessages.at(-1)?.orderNumber ?? -1) + 1;
    const insertedMessage = await dbInsertSharedChatContent({
      conversationId,
      id: userMessage.id,
      content: userMessage.content,
      role: 'user',
      orderNumber: userMessageOrderNumber,
      toolCalls: null,
      toolCallId: null,
    });
    if (insertedMessage === undefined) {
      throw new InvalidArgumentError('The message could not be stored, please try again');
    }
  }

  await linkFilesToSharedChatMessage({
    conversationMessageId: userMessage.id,
    conversationId,
    fileIds,
  });

  const previousMessages: ChatMessage[] = storedMessages
    .filter((message) => message.orderNumber < userMessageOrderNumber)
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      toolCalls: message.toolCalls ?? undefined,
      toolCallId: message.toolCallId ?? undefined,
    }));

  return { previousMessages, userMessageOrderNumber };
}
