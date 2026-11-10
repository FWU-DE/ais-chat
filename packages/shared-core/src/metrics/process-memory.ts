import { metrics } from '@opentelemetry/api';

/**
 * Reports the Node.js memory segments so native allocations (sharp/libvips, Buffers) can be told
 * apart from V8 heap growth: a rising `rss` without a rising `heap_used` points outside of V8.
 */
export function registerProcessMemoryMetrics(): void {
  const gauge = metrics
    .getMeter('ais-chat.runtime', '0.0.1')
    .createObservableGauge('process_memory_usage', {
      description: 'Node.js process memory usage by segment',
      unit: 'By',
    });

  gauge.addCallback((result) => {
    const usage = process.memoryUsage();

    result.observe(usage.rss, { segment: 'rss' });
    result.observe(usage.heapUsed, { segment: 'heap_used' });
    result.observe(usage.heapTotal, { segment: 'heap_total' });
    result.observe(usage.external, { segment: 'external' });
    result.observe(usage.arrayBuffers, { segment: 'array_buffers' });
  });
}
