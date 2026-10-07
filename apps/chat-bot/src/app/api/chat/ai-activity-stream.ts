import { createAiActivityCollector } from '@/utils/chat/ai-activity';
import type { AiActivityOptions } from '@/utils/chat/ai-activity';
import { encodeChatStreamEvent } from '@/utils/streaming';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import type { GenericToolRegistration, ToolResult } from './tools/types';

/**
 * Collects the agent activity and pushes every update to the client as a stream event.
 * The full step list is sent on each update so late subscribers cannot miss a step.
 */
export function createAiActivityStream(
  update: (chunk: string) => void,
<<<<<<< HEAD
  toolRegistry: Record<string, ToolRegistration>,
  options?: AiActivityOptions,
=======
  toolRegistry: Record<string, GenericToolRegistration>,
>>>>>>> cdca9ef7 (TD-1598: generalize tool registration)
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
    onToolResult: ({ toolCallId, result }: { toolCallId: string; result: ToolResult }) => {
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
