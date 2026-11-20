import { AiGenerationError } from '../errors';
import type { SpeechStreamGenerationFn, SpeechStreamResult, SpeechUsage } from './types';

type SegmentStream = SpeechStreamResult & { timeoutSignal: AbortSignal };

function sumUsages(usages: SpeechUsage[]): SpeechUsage {
  return usages.reduce(
    (acc, usage) => ({
      characters: acc.characters + usage.characters,
    }),
    { characters: 0 },
  );
}

/**
 * Synthesizes the segments one after another and exposes them as a single MP3 chunk stream.
 * MP3 frames are self-contained, so the segments' audio can be concatenated as is.
 */
export async function streamSpeechSegments({
  segments,
  voice,
  abortSignal,
  segmentTimeoutMs,
  generateSpeechStream,
}: {
  segments: string[];
  voice: string;
  abortSignal?: AbortSignal;
  segmentTimeoutMs: number;
  generateSpeechStream: SpeechStreamGenerationFn;
}): Promise<SpeechStreamResult> {
  if (segments.length === 0) {
    throw new AiGenerationError('No text to synthesize');
  }

  function toSegmentError(error: unknown, index: number, timeoutSignal: AbortSignal): unknown {
    if (abortSignal?.aborted) return error;

    const segmentLabel = `segment ${index + 1}/${segments.length}`;
    if (timeoutSignal.aborted) {
      return new AiGenerationError(
        `Speech generation timed out after ${segmentTimeoutMs} ms (${segmentLabel})`,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return new AiGenerationError(`Speech generation failed (${segmentLabel}): ${message}`);
  }

  async function startSegment(index: number): Promise<SegmentStream> {
    const timeoutSignal = AbortSignal.timeout(segmentTimeoutMs);
    const signal = abortSignal ? AbortSignal.any([timeoutSignal, abortSignal]) : timeoutSignal;
    try {
      const result = await generateSpeechStream({
        text: segments[index] ?? '',
        voice,
        abortSignal: signal,
      });
      return { ...result, timeoutSignal };
    } catch (error) {
      throw toSegmentError(error, index, timeoutSignal);
    }
  }

  // The first request is made eagerly so request failures surface before the response starts.
  const firstSegment = await startSegment(0);

  let resolveUsage: (usage: SpeechUsage) => void;
  const usage = new Promise<SpeechUsage>((resolve) => {
    resolveUsage = resolve;
  });

  async function* readChunks() {
    const usages: Promise<SpeechUsage>[] = [];
    try {
      let current: SegmentStream | undefined = firstSegment;
      for (let index = 0; current; index++) {
        const segment: SegmentStream = current;
        usages.push(segment.usage);
        try {
          yield* segment.chunks;
        } catch (error) {
          throw toSegmentError(error, index, segment.timeoutSignal);
        }
        current = index + 1 < segments.length ? await startSegment(index + 1) : undefined;
      }
    } finally {
      resolveUsage(sumUsages(await Promise.all(usages)));
    }
  }

  return { chunks: readChunks(), usage, mimeType: firstSegment.mimeType };
}
