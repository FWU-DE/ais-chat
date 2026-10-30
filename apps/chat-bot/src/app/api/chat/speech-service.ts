import type { AudioFormat } from '@ais-chat/ai-core';
import { generateSpeechById, streamSpeechById } from '@ais-chat/ai-core';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';
import { InvalidArgumentError } from '@shared/error';
import { getCachedSpeechPreview, setCachedSpeechPreview } from '@shared/speech/speech-cache';
import { calculateSpeechCostsInCent } from '@shared/speech/utils';
/**
 * Public result of the chat-facing streaming speech functions.
 * Raw PCM `chunks` in `format`, plus the `contentType` to send back.
 */
export type ChatSpeechStreamResult = {
  chunks: AsyncGenerator<Buffer, void, unknown>;
  contentType: string;
  format: AudioFormat;
};

/**
 * Streaming counterpart of `generateSpeech`. Yields raw PCM chunks as they arrive instead of
 * waiting for the full audio, and exposes `costsInCent` as a promise that only resolves once the
 * stream is fully drained (provider usage is only known after the last chunk).
 */
export async function generateSpeechStream({
  text,
  voice,
  abortSignal,
}: {
  text: string;
  voice?: string;
  abortSignal?: AbortSignal;
}) {
  const speechModelOrUndefined = await dbGetSpeechModel();

  if (!speechModelOrUndefined) {
    throw new Error('No speech model configured');
  }
  // Rebound to a new const so the non-undefined narrowing survives being captured by the
  // closures below (narrowing doesn't flow into nested closures/generators).
  const speechModel = speechModelOrUndefined;

  const voices = speechModel.modelConfig?.voices ?? [];
  const [firstVoice] = voices;

  if (firstVoice === undefined) {
    throw new Error('No voices configured for the speech model');
  }

  const selectedVoice = voice && voices.some((v) => v.name === voice) ? voice : firstVoice.name;

  const { chunks, usage, format } = await streamSpeechById({
    modelId: speechModel.id,
    text,
    voice: selectedVoice,
    abortSignal,
  });

  const costsInCent = usage.then((resolvedUsage) =>
    calculateSpeechCostsInCent(speechModel, resolvedUsage),
  );

  return {
    chunks,
    contentType: 'application/octet-stream',
    format,
    costsInCent,
    modelId: speechModel.id,
    provider: speechModel.provider,
    modelName: speechModel.name,
  };
}

export async function generateSpeechPreview({ text, voice }: { text: string; voice: string }) {
  const speechModel = await dbGetSpeechModel();

  if (!speechModel) {
    throw new Error('No speech model configured');
  }

  const voices = speechModel.modelConfig?.voices ?? [];

  if (!voices.some((v) => v.name === voice)) {
    throw new InvalidArgumentError(`Unknown voice: ${voice}`);
  }

  const cached = await getCachedSpeechPreview(speechModel.id, voice, text);
  if (cached !== undefined) {
    return {
      buffer: cached,
      contentType: 'audio/wav',
    };
  }

  const { wavBuffer } = await generateSpeechById({
    modelId: speechModel.id,
    text,
    voice,
  });

  await setCachedSpeechPreview(speechModel.id, voice, text, wavBuffer);

  return {
    buffer: wavBuffer,
    contentType: 'audio/wav',
  };
}
