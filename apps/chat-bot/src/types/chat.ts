import type { SharedChatExpiredError, TokenPointsExceededError } from '@ais-chat/ai-core/errors';
import type { NotFoundError } from '@shared/error';
import type { WebSearchResult } from '@shared/db/schema';
import type { ChatAttachment } from '@ais-chat/ai-core';
import {
  CONVERSATION_ROLES,
  type ConversationRole,
  type ToolCall,
} from '@ais-chat/ai-core/chat/types';
import z from 'zod';
import { isToolRelatedMessage } from '@shared/utils/tool-related-message';
import { aiActivityStepSchema, type AiActivityStep } from './ai-activity';

/**
 * Serialized error that can be safely transmitted across the Server Action boundary.
 */
export type SerializedError = {
  name: string;
  message: string;
};

/**
 * Status of a chat conversation.
 * - 'ready': Chat is ready for input
 * - 'submitted': Message has been submitted, waiting for response
 * - 'reasoning': Model is reasoning (for reasoning models like o1/o3)
 * - 'streaming': Response is being streamed
 * - 'error': An error occurred
 */
export type ChatStatus = 'ready' | 'submitted' | 'reasoning' | 'streaming' | 'error';

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(CONVERSATION_ROLES),
  content: z.string(),
  createdAt: z.coerce.date().optional(),
  attachments: z.array(z.any()).optional(),
  webSearchResults: z.array(z.any()).optional(),
  activitySteps: z.array(aiActivityStepSchema).optional(),
  toolCalls: z.array(z.any()).optional(),
  toolCallId: z.string().optional(),
});

/**
 * Basic chat message type used throughout the application.
 * This replaces the Message type from the 'ai' package.
 */
export type ChatMessage = {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt?: Date;
  attachments?: ChatAttachment[];
  webSearchResults?: WebSearchResult[];
  /** Tool steps the agent performed before answering, shown as "KI-Aktivität". */
  activitySteps?: AiActivityStep[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
};

/**
 * Result returned when sending a chat message.
 * The error field handles pre-streaming errors as a serialized plain object.
 */
export type SendMessageResult = {
  stream: ReadableStream<string>;
  messageId: string;
  webSearchResults?: WebSearchResult[];
  error?: SerializedError;
};

/**
 * Creates a SendMessageResult with a serialized error.
 */
export function createErrorResult(
  error: TokenPointsExceededError | SharedChatExpiredError | NotFoundError,
): SendMessageResult {
  return {
    stream: new ReadableStream<string>({
      start(controller) {
        controller.close(); // already closed stream
      },
    }),
    messageId: crypto.randomUUID(),
    error: { name: error.name, message: error.message },
  };
}

/**
 * Reconstructs an Error from a serialized error object.
 */
export function deserializeError(serialized: SerializedError): Error {
  const error = new Error(serialized.message);
  error.name = serialized.name;
  return error;
}

/**
 * Text part of a UI message for rendering.
 */
export type TextUIPart = {
  type: 'text';
  text: string;
};

/**
 * UI-ready message with parts for rendering.
 * This replaces the UIMessage type from the 'ai' package.
 */
export type UIMessage = ChatMessage & {
  parts: TextUIPart[];
};

/**
 * Convert ChatMessage[] to UIMessage[] for rendering.
 * Filters out tool-related messages.
 */
export function toUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages
    .filter((m) => !isToolRelatedMessage(m))
    .map((m) => ({
      ...m,
      parts: [{ type: 'text' as const, text: m.content }],
    }));
}

/**
 * Convert UIMessage[] to ChatMessage[] (strips parts).
 */
export function toChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }));
}
