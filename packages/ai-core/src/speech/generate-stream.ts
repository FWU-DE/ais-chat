import { AiGenerationError } from '../errors';
import { getSpeechModelById } from '../models';
import { constructGoogleStreamingSpeechGenerationFn } from './providers/google';
import type { SpeechStreamResult } from './types';

// Todo: Find a more appropriate max duration for speech streams
// Browser can throttle the download speed as soon as buffer fills up.
const SPEECH_STREAM_MAX_DURATION_MS = 5 * 60_000;

export async function streamSpeechById({
  modelId,
  text,
  voice,
  abortSignal,
}: {
  modelId: string;
  text: string;
  voice: string;
  /** Aborted when the HTTP client disconnects, combined with an internal ceiling below. */
  abortSignal?: AbortSignal;
}): Promise<SpeechStreamResult> {
  const model = await getSpeechModelById(modelId);
  const generateSpeechStream = constructGoogleStreamingSpeechGenerationFn(model);
  const timeoutSignal = AbortSignal.timeout(SPEECH_STREAM_MAX_DURATION_MS);
  const combinedSignal = abortSignal
    ? AbortSignal.any([timeoutSignal, abortSignal])
    : timeoutSignal;

  const { chunks, usage, format } = await generateSpeechStream({
    text,
    voice,
    abortSignal: combinedSignal,
  });

  async function* chunksWithTimeoutHandling() {
    try {
      yield* chunks;
    } catch (error) {
      if (timeoutSignal.aborted) {
        throw new AiGenerationError(
          `Speech generation timed out after ${SPEECH_STREAM_MAX_DURATION_MS} ms`,
        );
      }
      throw error;
    }
  }

  return { chunks: chunksWithTimeoutHandling(), usage, format };
}
