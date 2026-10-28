import { getSpeechModelById } from '../models';
import { AiGenerationError } from '../errors';
import { constructGoogleStreamingSpeechGenerationFn } from './providers/google';
import type { SpeechStreamResult } from './types';

// Generous ceiling for the whole stream (not just time-to-first-chunk), since long assistant
// messages legitimately take longer to fully synthesize than the non-streaming SPEECH_TIMEOUT_MS.
const SPEECH_STREAM_MAX_DURATION_MS = 60_000;

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
