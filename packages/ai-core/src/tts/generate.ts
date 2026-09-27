import { getSpeechModelById } from '../models';
import { AiGenerationError } from '../errors';
import { constructGoogleSpeechGenerationFn } from './providers/google';
import type { SpeechResponse } from './types';

const SPEECH_TIMEOUT_MS = 30_000;

export async function generateSpeechById({
  modelId,
  text,
  voice,
}: {
  modelId: string;
  text: string;
  voice: string;
}): Promise<SpeechResponse> {
  const model = await getSpeechModelById(modelId);
  const generateSpeech = constructGoogleSpeechGenerationFn(model);
  const abortSignal = AbortSignal.timeout(SPEECH_TIMEOUT_MS);

  try {
    return await generateSpeech({ text, voice, abortSignal });
  } catch (error) {
    if (abortSignal.aborted) {
      throw new AiGenerationError(`Speech generation timed out after ${SPEECH_TIMEOUT_MS} ms`);
    }
    throw error;
  }
}
