import { metrics } from '@opentelemetry/api';

type ImageOperation = 'upload' | 'scale' | 'attach';

const imageProcessingRssDelta = metrics
  .getMeter('ais-chat.images', '0.0.1')
  .createHistogram('image_processing_rss_delta', {
    description: 'Process RSS change across a single image processing operation',
    unit: 'By',
  });

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
    imageProcessingRssDelta.record(process.memoryUsage().rss - rssBefore, {
      'image.operation': operation,
      outcome,
      ...(format ? { 'image.format': format } : {}),
    });
  }
}
