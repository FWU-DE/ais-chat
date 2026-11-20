import { metrics } from '@opentelemetry/api';

const estimatedUsageCounter = metrics
  .getMeter('ais-chat.billing', '0.0.1')
  .createCounter('estimated_token_usage', {
    description: 'Generations billed with locally estimated token usage instead of provider data',
  });

export function recordEstimatedTokenUsage({
  modelName,
  provider,
}: {
  modelName: string;
  provider: string;
}): void {
  estimatedUsageCounter.add(1, {
    'gen_ai.request.model': modelName,
    'gen_ai.provider.name': provider,
  });
}
