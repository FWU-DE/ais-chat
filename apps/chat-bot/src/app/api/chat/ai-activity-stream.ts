import type { AiActivityOptions } from '@/utils/chat/ai-activity';
import { createAiActivityCollector } from '@/utils/chat/ai-activity';
import { encodeChatStreamEvent } from '@/utils/streaming';
import type { ToolCall, ToolErrorResult, ToolResult } from '@ais-chat/ai-core/chat/types';

/**
 * Collects the agent activity and pushes every update to the client as a stream event.
 * The full step list is sent on each update so late subscribers cannot miss a step.
 */
export function createAiActivityStream(
  update: (chunk: string) => void,
  options?: AiActivityOptions,
) {
  const collector = createAiActivityCollector(options);

  function publish() {
    update(encodeChatStreamEvent({ type: 'ai_activity', steps: collector.getSteps() }));
  }

  return {
    onToolCalls: (toolCalls: ToolCall[]) => {
      collector.addToolCalls(toolCalls);
    },
    onReasoningSummary: (delta: string, part?: { itemId: string; summaryIndex: number }) => {
      collector.addReasoningSummary(delta, part);
    },
    onToolResult: ({
      toolCallId,
      result,
    }: {
      toolCallId: string;
      result: ToolResult | ToolErrorResult;
    }) => {
      if (collector.addToolResult(toolCallId, result)) {
        publish();
      }
    },
    finish: () => {
      if (collector.finish()) {
        publish();
      }
    },
    getReasoningSummary: collector.getReasoningSummary,
    getSteps: () => collector.getSteps(),
  };
}
