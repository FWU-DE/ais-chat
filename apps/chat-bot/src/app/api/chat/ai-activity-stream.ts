import type { AiActivityOptions } from '@/utils/chat/ai-activity';
import { createAiActivityCollector } from '@/utils/chat/ai-activity';
import { encodeChatStreamEvent } from '@/utils/streaming';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import type { ToolRegistry } from './tools/types';

/**
 * Collects the agent activity and pushes every update to the client as a stream event.
 * The full step list is sent on each update so late subscribers cannot miss a step.
 */
export function createAiActivityStream(
  update: (chunk: string) => void,
  toolRegistry: ToolRegistry,
  options?: AiActivityOptions,
) {
  const collector = createAiActivityCollector(toolRegistry, options);

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
    onToolResult: ({ toolCallId, result }: { toolCallId: string; result: unknown }) => {
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
