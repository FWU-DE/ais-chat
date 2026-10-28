import { ConversationMessageModel } from '@shared/db/types';
import { type ChatMessage } from '@/types/chat';
import {
  type AiActivityStep,
  type AiActivityToolName,
  isAiActivityToolName,
} from '@/types/ai-activity';
import type { ToolErrorResult, ToolResult } from '@ais-chat/ai-core/chat/types';
import { logError } from '@shared/logging/logging';
import { createAiActivityCollector } from './ai-activity';
import { toolActivityRegistry } from '@/app/api/chat/build-tools';
import type { ToolActivity } from '@/app/api/chat/tools/types';
import {
  parseGenericPersistedToolResult,
  parsePersistedToolResultContent,
} from '@/app/api/chat/tools/parse-persisted-tool-result';

// A tool's own `parsePersistedResult` isn't trusted to handle malformed/legacy persisted data
// defensively, so a throw here is treated like a parsed `ToolErrorResult`: the step still gets
// added, just unenriched, instead of aborting the whole reload loop.
function parsePersistedResultSafely(
  activity: ToolActivity,
  rawContent: unknown,
): ToolResult | ToolErrorResult | undefined {
  try {
    return activity.parsePersistedResult(rawContent);
  } catch (error) {
    logError('Failed to parse persisted tool result', error);
    return { error: 'Failed to parse persisted tool result' };
  }
}

/**
 * Reconstructs AI activity steps from persisted messages by replaying them through the same
 * collector used for live streaming.
 */
function getActivitySteps(
  messages: Array<ConversationMessageModel>,
): Map<string, AiActivityStep[]> {
  const activityByMessageId = new Map<string, AiActivityStep[]>();
  const toolNameByCallId = new Map<string, AiActivityToolName>();
  let collector = createAiActivityCollector();

  for (const message of messages) {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      collector.addToolCalls(message.toolCalls);
      for (const toolCall of message.toolCalls) {
        if (isAiActivityToolName(toolCall.name)) {
          toolNameByCallId.set(toolCall.id, toolCall.name);
        }
      }
      continue;
    }

    if (message.role === 'tool' && message.toolCallId !== null) {
      const rawContent = parsePersistedToolResultContent(message.content);
      if (rawContent !== undefined) {
        const toolName = toolNameByCallId.get(message.toolCallId);
        const activity = toolName ? toolActivityRegistry[toolName] : undefined;
        const parsedResult = activity
          ? parsePersistedResultSafely(activity, rawContent)
          : parseGenericPersistedToolResult<ToolResult>(rawContent);

        if (parsedResult !== undefined) {
          collector.addToolResult(message.toolCallId, parsedResult);
        }
      }
      continue;
    }

    if (message.role === 'assistant') {
      if (message.reasoningSummary) {
        collector.addReasoningSummary(message.reasoningSummary);
      }

      if (collector.finish()) {
        activityByMessageId.set(message.id, collector.getSteps());
      }

      collector = createAiActivityCollector();
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
