import { metrics } from '@opentelemetry/api';

type ImageOperation = 'upload' | 'scale' | 'attach';

const imageProcessingRssDelta = metrics
  .getMeter('ais-chat.images', '0.0.1')
  .createHistogram('image_processing_rss_delta', {
    description: 'Magnitude of the process RSS change across a single image processing operation',
    unit: 'By',
  });

/** The SDK drops negative histogram values, so the sign has to travel as an attribute. */
function memoryDirection(delta: number): 'increase' | 'decrease' | 'unchanged' {
  if (delta > 0) return 'increase';
  if (delta < 0) return 'decrease';
  return 'unchanged';
}

/**
 * Concurrent requests and GC make a single sample noisy; the signal is in the distribution across
 * many operations, not in any individual measurement.
 */
export async function measureImageProcessing<T>(
  { operation, format }: { operation: ImageOperation; format?: string },
  run: () => Promise<T>,
): Promise<T> {
  const rssBefore = process.memoryUsage().rss;
  let outcome = 'success';

  try {
    return await run();
  } catch (error) {
    outcome = 'error';
    throw error;
  } finally {
    const rssDelta = process.memoryUsage().rss - rssBefore;

    imageProcessingRssDelta.record(Math.abs(rssDelta), {
      'image.operation': operation,
      'memory.direction': memoryDirection(rssDelta),
      outcome,
      ...(format ? { 'image.format': format } : {}),
    });
  }
}
