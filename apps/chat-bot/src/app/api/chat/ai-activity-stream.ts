import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { createAiActivityCollector } from '@/utils/chat/ai-activity';
import { encodeChatStreamEvent } from '@/utils/streaming';

/**
 * Collects the agent activity and pushes every update to the client as a stream event.
 * The full step list is sent on each update so late subscribers cannot miss a step.
 */
export function createAiActivityStream(update: (chunk: string) => void) {
  const collector = createAiActivityCollector();

  function publish() {
    update(encodeChatStreamEvent({ type: 'ai_activity', steps: collector.getSteps() }));
  }

  return {
    onToolCalls: (toolCalls: ToolCall[]) => {
      if (collector.addToolCalls(toolCalls)) {
        publish();
      }
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
    getSteps: () => collector.getSteps(),
  };
}
