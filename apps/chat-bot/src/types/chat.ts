import { CONVERSATION_ROLES } from '@ais-chat/ai-core/chat/types';
import { isToolRelatedMessage } from '@shared/utils/tool-related-message';
import z from 'zod';

import { aiActivityStepSchema } from './ai-activity';

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
 * - 'streaming': Response is being streamed
 * - 'error': An error occurred
 */
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(CONVERSATION_ROLES),
  content: z.string(),
  createdAt: z.coerce.date().optional(),
  modelName: z.string().optional(),
  attachments: z.array(z.any()).optional(),
  activitySteps: z.array(aiActivityStepSchema).optional(),
  toolCalls: z.array(z.any()).optional(),
  toolCallId: z.string().optional(),
});

/**
 * Basic chat message type used throughout the application.
 * This replaces the Message type from the 'ai' package.
 */
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * Result returned when sending a chat message.
 * Errors before streaming come back through the server action result, errors during streaming
 * arrive as error events in the stream.
 */
export type SendMessageResult = {
  stream: ReadableStream<string>;
  messageId: string;
};

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
