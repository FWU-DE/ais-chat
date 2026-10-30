import { generateSpeechById } from '@ais-chat/ai-core';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';
import { InvalidArgumentError } from '@shared/error';
import { getCachedSpeechPreview, setCachedSpeechPreview } from '@shared/speech/speech-cache';

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
