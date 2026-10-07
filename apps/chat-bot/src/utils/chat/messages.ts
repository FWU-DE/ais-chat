import { ConversationMessageModel } from '@shared/db/types';
import { type ChatMessage } from '@/types/chat';
import { type AiActivityStep, type AiActivityToolStep } from '@/types/ai-activity';
import {
  applyToolActivityResult,
  createToolActivityStep,
} from '@/app/api/chat/tools/tool-activity';

function getActivitySteps(
  messages: Array<ConversationMessageModel>,
): Map<string, AiActivityStep[]> {
  const activityByMessageId = new Map<string, AiActivityStep[]>();
  const steps: AiActivityStep[] = [];
  const stepsByToolCallId = new Map<string, AiActivityToolStep>();

  for (const message of messages) {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      for (const toolCall of message.toolCalls) {
        const step = createToolActivityStep(toolCall);
        if (step === undefined) {
          continue;
        }

        steps.push(step);
        stepsByToolCallId.set(step.id, step);
      }

      if (message.toolCalls?.length) {
        continue;
      }
    }

    if (message.role === 'tool' && message.toolCallId !== null) {
      const step = stepsByToolCallId.get(message.toolCallId);
      if (step !== undefined) {
        const updatedStep = applyToolActivityResult(step, message.content);
        steps[steps.indexOf(step)] = updatedStep;
        stepsByToolCallId.set(message.toolCallId, updatedStep);
      }
      continue;
    }

    if (message.role === 'assistant' && (steps.length > 0 || message.reasoningSummary)) {
      if (message.reasoningSummary) {
        steps.push({ kind: 'analysis-summary', content: message.reasoningSummary });
      }
      steps.push({ kind: 'done' });
      activityByMessageId.set(message.id, [...steps]);
      steps.length = 0;
      stepsByToolCallId.clear();
    }
  }

  return activityByMessageId;
}

/**
 * Converts database conversation message models to frontend message format.
 *
 * @param messages - Array of conversation messages from the database
 * @returns Array of messages compatible with the chat format
 */
export function convertMessageModelToMessage(
  messages: Array<ConversationMessageModel>,
): Array<ChatMessage> {
  const activityByMessageId = getActivitySteps(messages);

  return messages.map((message) => {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      activitySteps: activityByMessageId.get(message.id),
      toolCalls: message.toolCalls ?? undefined,
      toolCallId: message.toolCallId ?? undefined,
    };
  });
}
