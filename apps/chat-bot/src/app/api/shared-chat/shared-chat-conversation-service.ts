import type { Message as AiCoreMessage } from '@ais-chat/ai-core';
import { dbGetFilesInIds } from '@shared/db/functions/files';
import {
  dbAppendSharedChatConversationMessages,
  dbGetOrCreateSharedChatConversation,
  dbGetSharedChatConversation,
  dbGetSharedChatConversationMessageFileIds,
  dbGetSharedChatConversationMessages,
  dbGetSharedChatFileConversationIds,
  dbPrepareSharedChatConversation,
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
    const mappedElsewhere = (await dbGetSharedChatFileConversationIds(currentFileIds)).some(
      (mapping) => mapping.conversationId !== sharedSessionId,
    );
    if (mappedElsewhere) {
      throw new ForbiddenError('Not authorized to access this file');
    }
  }

  const storedConversationMessages = await dbGetSharedChatConversationMessages(sharedSessionId);
  const storedFileIds = (await dbGetSharedChatConversationMessageFileIds(sharedSessionId)).map(
    (mapping) => mapping.fileId,
  );
  const storedMessages: ChatMessage[] = storedConversationMessages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    toolCalls: message.toolCalls ?? undefined,
    toolCallId: message.toolCallId ?? undefined,
  }));
  const repeatedMessageIndex = storedMessages.findIndex(
    (message) => message.id === currentUserMessage.id,
  );
  const previousMessages =
    repeatedMessageIndex === -1 ? storedMessages : storedMessages.slice(0, repeatedMessageIndex);
  const { userOrderNumber } = await dbPrepareSharedChatConversation({
    conversationId: sharedSessionId,
    userMessage: currentUserMessage,
    fileIds: currentFileIds,
  });

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

      await dbAppendSharedChatConversationMessages({
        firstOrderNumber: userOrderNumber + 1,
        messages: messagesToPersist,
      });
    },
  };
}
