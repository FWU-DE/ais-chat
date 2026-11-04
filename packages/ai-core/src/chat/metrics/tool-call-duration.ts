import { metrics } from '@opentelemetry/api';

const toolCallDuration = metrics
  .getMeter('ais-chat.tools', '0.0.1')
  .createHistogram('tool_call_duration', {
    description: 'Duration of executed AI tool calls',
    unit: 'ms',
  });

export function recordToolCallDuration({
  durationMs,
  toolName,
  status,
}: {
  durationMs: number;
  toolName: string;
  status: string;
}): void {
  toolCallDuration.record(durationMs, {
    'gen_ai.tool.name': toolName,
    'tool.status': status,
  });
}
