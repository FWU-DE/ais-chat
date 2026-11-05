import type { ChatMessage } from '@/types/chat';
import type { Message as AiCoreMessage } from '@ais-chat/ai-core';
import { dbGetFilesInIds } from '@shared/db/functions/files';
import {
  dbAppendSharedChatConversationMessages,
  dbGetOrCreateSharedChatConversation,
  dbGetSharedChatConversation,
  dbGetSharedChatConversationMessageFileIds,
  dbGetSharedChatConversationMessages,
  dbPrepareSharedChatConversation,
} from '@shared/db/functions/shared-chat-sessions';
import { ForbiddenError, InvalidArgumentError } from '@shared/error';
import { isToolRelatedMessage } from '@shared/utils/tool-related-message';

type SharedChatFile = { id: string; name: string; type: string; size: number };

export type SharedChatSessionHistory = {
  messages: ChatMessage[];
  filesByMessageId: Array<{ messageId: string; files: SharedChatFile[] }>;
};

export async function loadSharedChatSessionMessages({
  sharedSessionId,
  inviteCode,
  entityType,
  entityId,
}: {
  sharedSessionId: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
}): Promise<SharedChatSessionHistory> {
  const session = await dbGetSharedChatConversation({
    conversationId: sharedSessionId,
    inviteCode,
    entityType,
    entityId,
  });
  if (session === undefined) {
    return { messages: [], filesByMessageId: [] };
  }

  const messages = await dbGetSharedChatConversationMessages(session.id);
  const messageFileIds = await dbGetSharedChatConversationMessageFileIds(session.id);
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

export async function prepareSharedChatSession({
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
    throw new ForbiddenError('Not authorized to access this shared chat session');
  }

  const currentUserMessage = clientMessages.findLast((message) => message.role === 'user');
  if (currentUserMessage === undefined) {
    throw new InvalidArgumentError('A user message is required');
  }

  const session = await dbGetOrCreateSharedChatConversation({
    conversationId: sharedSessionId,
    inviteCode,
    entityType,
    entityId,
  });
  if (session === undefined) {
    throw new ForbiddenError('Not authorized to access this shared chat session');
  }

  const storedSessionMessages = await dbGetSharedChatConversationMessages(sharedSessionId);
  const storedFileIds = (await dbGetSharedChatConversationMessageFileIds(sharedSessionId)).map(
    (mapping) => mapping.fileId,
  );
  const storedMessages: ChatMessage[] = storedSessionMessages.map((message) => ({
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
  await dbPrepareSharedChatConversation({
    conversationId: sharedSessionId,
    userMessage: currentUserMessage,
    fileIds,
  });
  const turnMessages: ChatMessage[] = [];

  if (previousMessages.length === 0 && initialMessage) {
    turnMessages.push({ id: 'initial-message', role: 'assistant', content: initialMessage });
  }
  turnMessages.push(currentUserMessage);

  return {
    messages: [...previousMessages, ...turnMessages],
    fileIds: [...new Set([...(fileIds ?? []), ...storedFileIds])],
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
          sessionId: sharedSessionId,
          ...message,
          content: message.content,
          role: message.role,
          toolCalls: message.toolCalls ?? null,
          toolCallId: message.toolCallId ?? null,
        })),
        {
          id: assistantMessageId,
          sessionId: sharedSessionId,
          role: 'assistant' as const,
          content: fullText,
          toolCalls: null,
          toolCallId: null,
        },
      ];

      await dbAppendSharedChatConversationMessages({
        conversationId: sharedSessionId,
        messages: messagesToPersist,
      });
    },
  };
}
