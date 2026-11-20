import { metrics } from '@opentelemetry/api';

const generationRssDelta = metrics
  .getMeter('ais-chat.gen_ai', '0.0.1')
  .createHistogram('ai_generation_rss_delta', {
    description: 'Magnitude of the process RSS change across a single agent loop run',
    unit: 'By',
  });

/** The SDK drops negative histogram values, so the sign has to travel as an attribute. */
function memoryDirection(delta: number): 'increase' | 'decrease' | 'unchanged' {
  if (delta > 0) return 'increase';
  if (delta < 0) return 'decrease';
  return 'unchanged';
}

/** Attributes stay free of prompts, completions and user identifiers by design. */
export function recordGenerationRssDelta({
  rssDelta,
  outcome,
  agentName,
  modelName,
  errorType,
}: {
  rssDelta: number;
  outcome: 'success' | 'error' | 'aborted';
  agentName: string;
  modelName: string;
  errorType?: string;
}): void {
  generationRssDelta.record(Math.abs(rssDelta), {
    outcome,
    'memory.direction': memoryDirection(rssDelta),
    'gen_ai.agent.name': agentName,
    'gen_ai.request.model': modelName,
    ...(errorType ? { 'error.type': errorType } : {}),
  });
}
