import type { ChatMessage } from '@/types/chat';
import type { Message as AiCoreMessage } from '@ais-chat/ai-core';
import {
  dbGetOrCreateSharedChatSession,
  dbGetSharedChatSession,
  dbGetSharedChatSessionMessages,
  dbReplaceSharedChatSessionMessages,
} from '@shared/db/functions/shared-chat-sessions';
import { ForbiddenError, InvalidArgumentError } from '@shared/error';
import { isToolRelatedMessage } from '@shared/utils/tool-related-message';

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
}): Promise<ChatMessage[]> {
  const session = await dbGetSharedChatSession({
    sessionId: sharedSessionId,
    inviteCode,
    entityType,
    entityId,
  });
  if (session === undefined) {
    return [];
  }

  const messages = await dbGetSharedChatSessionMessages(session.id);
  return messages
    .filter((message) => !isToolRelatedMessage(message))
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    }));
}

export async function prepareSharedChatSession({
  sharedSessionId,
  inviteCode,
  entityType,
  entityId,
  expiresAt,
  initialMessage,
  clientMessages,
}: {
  sharedSessionId?: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  expiresAt: Date;
  initialMessage?: string | null;
  clientMessages: ChatMessage[];
}) {
  if (sharedSessionId === undefined || sharedSessionId.trim() === '') {
    throw new ForbiddenError('Not authorized to access this shared chat session');
  }

  const currentUserMessage = clientMessages.findLast((message) => message.role === 'user');
  if (currentUserMessage === undefined) {
    throw new InvalidArgumentError('A user message is required');
  }

  const session = await dbGetOrCreateSharedChatSession({
    sessionId: sharedSessionId,
    inviteCode,
    entityType,
    entityId,
    expiresAt,
  });
  if (session === undefined) {
    throw new ForbiddenError('Not authorized to access this shared chat session');
  }

  const storedMessages: ChatMessage[] = (await dbGetSharedChatSessionMessages(sharedSessionId)).map(
    (message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      toolCalls: message.toolCalls ?? undefined,
      toolCallId: message.toolCallId ?? undefined,
    }),
  );
  const repeatedMessageIndex = storedMessages.findIndex(
    (message) => message.id === currentUserMessage.id,
  );
  const previousMessages =
    repeatedMessageIndex === -1 ? storedMessages : storedMessages.slice(0, repeatedMessageIndex);
  const turnMessages: ChatMessage[] = [];

  if (previousMessages.length === 0 && initialMessage) {
    turnMessages.push({ id: 'initial-message', role: 'assistant', content: initialMessage });
  }
  turnMessages.push(currentUserMessage);

  return {
    messages: [...previousMessages, ...turnMessages],
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
        ...turnMessages,
        ...agentLoopMessages.map((message) => ({
          id: crypto.randomUUID(),
          ...message,
        })),
        { id: assistantMessageId, role: 'assistant' as const, content: fullText },
      ];

      await dbReplaceSharedChatSessionMessages({
        sessionId: sharedSessionId,
        fromOrderNumber: previousMessages.length,
        messages: messagesToPersist.map((message, index) => ({
          id: message.id,
          sessionId: sharedSessionId,
          content: message.content,
          role: message.role,
          orderNumber: previousMessages.length + index,
          toolCalls: message.toolCalls ?? null,
          toolCallId: message.toolCallId ?? null,
        })),
      });
    },
  };
}
