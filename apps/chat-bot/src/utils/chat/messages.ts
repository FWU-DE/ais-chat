import { ConversationMessageModel } from '@shared/db/types';
import { type ChatMessage } from '@/types/chat';
import { aiActivityStepSchema } from '@/types/ai-activity';

/**
 * Converts database conversation message models to frontend message format.
 *
 * @param messages - Array of conversation messages from the database
 * @returns Array of messages compatible with the chat format
 */
export function convertMessageModelToMessage(
  messages: Array<ConversationMessageModel>,
): Array<ChatMessage> {
  return messages.map((message) => {
    const activitySteps = aiActivityStepSchema.array().safeParse(message.aiActivity ?? []);

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      webSearchResults: message.webSearchResults ?? undefined,
      activitySteps:
        activitySteps.success && activitySteps.data.length > 0 ? activitySteps.data : undefined,
      toolCalls: message.toolCalls ?? undefined,
      toolCallId: message.toolCallId ?? undefined,
    };
  });
}
