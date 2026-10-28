'use client';

import { sendCharacterMessageAction } from '@/app/api/character/actions';
import { sendChatMessageAction } from '@/app/api/chat/actions';
import { sendLearningScenarioMessageAction } from '@/app/api/learning-scenario/actions';
import { type ChatStatus, type UIMessage } from '@/types/chat';
import { useCallback } from 'react';
import {
  useAisChat,
  type ChatMessage,
  type SendMessageFn,
  type UseChatReturn,
} from './use-ais-chat';

// Re-export types for convenience
export type { ChatMessage, ChatStatus, UIMessage, UseChatReturn };

/**
 * Hook for main chat (with optional character/customGpt)
 */
export function useMainChat(options: {
  conversationId: string;
  initialMessages?: ChatMessage[];
  modelId?: string;
  modelName?: string;
  characterId?: string;
  learningScenarioId?: string;
  assistantId?: string;
  onError?: (error: Error) => void;
  onFinish?: (message: ChatMessage) => void;
  onMessageCreated?: (messageId: string) => void;
}): UseChatReturn {
  const { conversationId, characterId, learningScenarioId, assistantId, ...rest } = options;

  const sendMessage: SendMessageFn = useCallback(
    async ({ messages, modelId, fileIds }) => {
      return sendChatMessageAction({
        conversationId,
        messages,
        modelId,
        characterId,
        learningScenarioId,
        assistantId,
        fileIds,
      });
    },
    [conversationId, characterId, learningScenarioId, assistantId],
  );

  return useAisChat({
    sendMessage,
    ...rest,
  });
}

/**
 * Hook for character chat (shared character)
 */
export function useCharacterChat(options: {
  characterId: string;
  inviteCode: string;
  initialMessages?: ChatMessage[];
  modelId?: string;
  onError?: (error: Error) => void;
  onFinish?: (message: ChatMessage) => void;
}): UseChatReturn {
  const { characterId, inviteCode, ...rest } = options;

  const sendMessage: SendMessageFn = useCallback(
    async ({ messages, fileIds, sharedSessionId }) => {
      return sendCharacterMessageAction({
        characterId,
        inviteCode,
        messages,
        fileIds,
        sharedSessionId,
      });
    },
    [characterId, inviteCode],
  );

  return useAisChat({
    sendMessage,
    ...rest,
  });
}

/**
 * Hook for shared school chat (learning scenario)
 */
export function useLearningScenarioChat(options: {
  learningScenarioId: string;
  inviteCode: string;
  initialMessages?: ChatMessage[];
  modelId?: string;
  onError?: (error: Error) => void;
  onFinish?: (message: ChatMessage) => void;
}): UseChatReturn {
  const { learningScenarioId, inviteCode, ...rest } = options;

  const sendMessage: SendMessageFn = useCallback(
    async ({ messages, fileIds, sharedSessionId }) => {
      return sendLearningScenarioMessageAction({
        learningScenarioId,
        inviteCode,
        messages,
        fileIds,
        sharedSessionId,
      });
    },
    [learningScenarioId, inviteCode],
  );

  return useAisChat({
    sendMessage,
    ...rest,
  });
}
