import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { createAiActivityCollector } from '@/utils/chat/ai-activity';
import { encodeChatStreamEvent } from '@/utils/streaming';
import type { ToolRegistration } from './tools/types';

/**
 * Collects the agent activity and pushes every update to the client as a stream event.
 * The full step list is sent on each update so late subscribers cannot miss a step.
 */
export function createAiActivityStream(
  update: (chunk: string) => void,
  toolRegistry: Record<string, ToolRegistration>,
) {
  const collector = createAiActivityCollector(toolRegistry);

  function publish() {
    update(encodeChatStreamEvent({ type: 'ai_activity', steps: collector.getSteps() }));
  }

  return {
    onToolCalls: (toolCalls: ToolCall[]) => {
      collector.addToolCalls(toolCalls);
    },
    onReasoningSummary: (delta: string) => {
      collector.addReasoningSummary(delta);
    },
    onToolResult: ({ toolCallId, result }: { toolCallId: string; result: string }) => {
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
