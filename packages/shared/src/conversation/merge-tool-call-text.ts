import type { ConversationMessageModel } from '@shared/db/types';
import { isToolRelatedMessage } from '@shared/utils/tool-related-message';

type MergeableMessage = Pick<ConversationMessageModel, 'role' | 'content'> &
  Partial<Pick<ConversationMessageModel, 'toolCalls' | 'toolCallId' | 'isLegacyAggregatedContent'>>;

/**
 * Joins the texts of the agent loop iterations the same way they are streamed to the client.
 */
export function joinAgentLoopTexts(texts: string[]): string {
  return texts.reduce((joined, text) => {
    if (text.length === 0) {
      return joined;
    }
    if (joined.length > 0 && !joined.endsWith('\n\n')) {
      return `${joined}\n\n${text}`;
    }
    return joined + text;
  }, '');
}

/**
 * Each agent loop message stores only its own text. Tool-related messages are hidden in the UI
 * and exports, so the text of the assistant tool-call messages of an agent loop is prepended to the
 * final assistant message of that agent loop for display. Tool-related messages are kept unchanged.
 */
export function mergeToolCallTextIntoFinalMessages<T extends MergeableMessage>(messages: T[]): T[] {
  let toolCallTexts: string[] = [];

  return messages.map((message) => {
    if (message.role === 'user') {
      toolCallTexts = [];
      return message;
    }

    if (isToolRelatedMessage(message)) {
      if (message.role === 'assistant') {
        toolCallTexts.push(message.content);
      }
      return message;
    }

    if (message.role !== 'assistant') {
      return message;
    }

    const precedingTexts = toolCallTexts;
    toolCallTexts = [];

    // Legacy path: remove once all conversations stored in the aggregated format are deleted.
    if (message.isLegacyAggregatedContent) {
      return message;
    }

    if (precedingTexts.length === 0) {
      return message;
    }

    return { ...message, content: joinAgentLoopTexts([...precedingTexts, message.content]) };
  });
}
