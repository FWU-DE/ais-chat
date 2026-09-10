'use client';

import { useState, useCallback, useRef } from 'react';
import { decodeChatStreamEvent, readTextStream } from '@/utils/streaming';
import type { WebSearchResult } from '@shared/db/schema';
import {
  deserializeError,
  toUIMessages,
  UIMessage,
  type ChatMessage,
  type ChatStatus,
  type SendMessageResult,
} from '@/types/chat';
import { logError } from '@shared/logging';

// Re-export for consumers
export type { ChatMessage, ChatStatus };

/**
 * Function type for sending chat messages.
 * Each chat type (main chat, character chat, shared chat) will implement this interface.
 */
export type SendMessageFn = (params: {
  messages: ChatMessage[];
  modelId: string;
  fileIds?: string[];
  sharedSessionId?: string;
}) => Promise<SendMessageResult>;

export type UseChatOptions = {
  initialMessages?: ChatMessage[];
  modelId?: string;
  sendMessage: SendMessageFn;
  onError?: (error: Error) => void;
  onFinish?: (message: ChatMessage) => void;
  onMessageCreated?: (messageId: string) => void;
};

export type UseChatReturn = {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  uiMessages: UIMessage[];
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSubmit: (
    e: React.FormEvent,
    options?: { fileIds?: string[]; userMessageId?: string; sharedSessionId?: string },
  ) => Promise<void>;
  isLoading: boolean;
  status: ChatStatus;
  error: Error | null;
  reload: () => Promise<void>;
  stop: () => void;
};

function lastUserMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      return messages[i] ?? null;
    }
  }
  return null;
}

/**
 * Custom hook to manage chat state and streaming.
 * Replaces the Vercel AI SDK's useChat hook with Server Actions.
 */
export function useAisChat({
  initialMessages = [],
  modelId,
  sendMessage,
  onError,
  onFinish,
  onMessageCreated,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>('ready');
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Seed from the actual initial state (which may have been restored from
  // storage by the caller), so reload() works after a page refresh.
  const lastUserMessageRef = useRef<ChatMessage | null>(lastUserMessage(messages));

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    [],
  );

  const submitMessage = useCallback(
    async (
      userMessage: ChatMessage,
      fileIds?: string[],
      existingMessages?: ChatMessage[],
      sharedSessionId?: string,
    ) => {
      if (!modelId) {
        const err = new Error('No model selected');
        setError(err);
        setStatus('error');
        onError?.(err);
        return;
      }

      setStatus('submitted');
      setError(null);
      abortControllerRef.current = new AbortController();

      // Add user message immediately
      const baseMessages = existingMessages ?? messages;
      const newMessages = [...baseMessages, userMessage];
      setMessages(newMessages);
      lastUserMessageRef.current = userMessage;

      try {
        const result = await sendMessage({
          messages: newMessages,
          modelId,
          fileIds,
          sharedSessionId,
        });

        if (result.error) {
          throw deserializeError(result.error);
        }

        // We need to handle the first chunk separately to avoid missing content
        let firstChunk = true;
        let assistantWebSearchResults: WebSearchResult[] = result.webSearchResults ?? [];

        const ensureAssistantMessage = () => {
          if (!firstChunk) {
            return;
          }

          const assistantMessage: ChatMessage = {
            id: result.messageId,
            role: 'assistant',
            content: '',
            webSearchResults: assistantWebSearchResults,
          };

          setMessages((prev) => [...prev, assistantMessage]);
          setStatus('streaming');
          firstChunk = false;
        };

        // Stream the response using native ReadableStream
        for await (const content of readTextStream(result.stream)) {
          if (abortControllerRef.current?.signal.aborted) {
            break;
          }

          if (content !== undefined && content !== null) {
            const streamEvent = decodeChatStreamEvent(content);

            if (streamEvent?.type === 'web_search_results') {
              assistantWebSearchResults = streamEvent.webSearchResults;

              if (firstChunk) {
                continue;
              }

              setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;

                if (updated[lastIdx]?.role === 'assistant') {
                  updated[lastIdx] = {
                    ...updated[lastIdx]!,
                    webSearchResults: assistantWebSearchResults,
                  };
                }

                return updated;
              });

              continue;
            }

            ensureAssistantMessage();
            setMessages((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (updated[lastIdx]?.role === 'assistant') {
                updated[lastIdx] = {
                  ...updated[lastIdx]!,
                  content: updated[lastIdx]!.content + content,
                };
              }
              return updated;
            });
          }
        }

        // Get final message for onFinish callback
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant') {
            onFinish?.(lastMsg);
          }
          return prev;
        });

        setStatus('ready');
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setStatus('error');
        onError?.(error);
        logError('Error in submitMessage', error);

        // Remove the assistant placeholder on error
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.content === '') {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        abortControllerRef.current = null;
      }
    },
    [messages, modelId, sendMessage, onError, onFinish],
  );

  const handleSubmit = useCallback(
    async (
      e: React.FormEvent,
      options?: { fileIds?: string[]; userMessageId?: string; sharedSessionId?: string },
    ) => {
      e.preventDefault();

      if (!input.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: options?.userMessageId ?? crypto.randomUUID(),
        role: 'user',
        content: input.trim(),
      };

      // Call onMessageCreated immediately so files can be associated with this message ID
      onMessageCreated?.(userMessage.id);

      setInput('');
      await submitMessage(userMessage, options?.fileIds, undefined, options?.sharedSessionId);
    },
    [input, isLoading, submitMessage, onMessageCreated],
  );

  const reload = useCallback(async () => {
    if (!lastUserMessageRef.current) return;
    const messageContent = lastUserMessageRef.current;

    const lastUserIndex = messages.findIndex((msg) => msg.id === lastUserMessageRef.current!.id);

    // Sadly this is needed, so we don't need to wait for a re-render between updating the messages and submitting
    // Otherwise, i'd use setMessages with a function update. (Also note: function updates to not allow you to update surrounding variables / it happens unreliably)
    const curMessages = messages.slice(0, lastUserIndex);

    // Remove all assistant messages after the last user message, and the user message itself
    setMessages(curMessages);

    await submitMessage(messageContent, undefined, curMessages);
  }, [submitMessage, messages]);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    messages,
    setMessages,
    uiMessages: toUIMessages(messages),
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    status,
    error,
    reload,
    stop,
  };
}
