import { getSpeechModelById } from '../models';
import { AiGenerationError } from '../errors';
import { constructGoogleSpeechGenerationFn } from './providers/google';
import type { SpeechResponse } from './types';

const SPEECH_TIMEOUT_MS = 30_000;

export async function generateSpeechById({
  modelId,
  text,
  voice,
  abortSignal: externalAbortSignal,
}: {
  modelId: string;
  text: string;
  voice: string;
  abortSignal?: AbortSignal;
}): Promise<SpeechResponse> {
  const model = await getSpeechModelById(modelId);
  const generateSpeech = constructGoogleSpeechGenerationFn(model);
  const timeoutSignal = AbortSignal.timeout(SPEECH_TIMEOUT_MS);
  const abortSignal = externalAbortSignal
    ? AbortSignal.any([externalAbortSignal, timeoutSignal])
    : timeoutSignal;

  try {
    return await generateSpeech({ text, voice, abortSignal });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new AiGenerationError(`Speech generation timed out after ${SPEECH_TIMEOUT_MS} ms`);
    }
    throw error;
  }
}
