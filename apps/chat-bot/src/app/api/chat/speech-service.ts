import { generateSpeechById } from '@ais-chat/ai-core';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';

export async function generateSpeech({ text, voice }: { text: string; voice?: string }) {
  const speechModel = await dbGetSpeechModel();

  if (!speechModel) {
    throw new Error('No speech model configured');
  }

  const voices = speechModel.modelConfig?.voices ?? [];
  const [firstVoice] = voices;

  if (firstVoice === undefined) {
    throw new Error('No voices configured for the speech model');
  }

  const selectedVoice = voice && voices.some((v) => v.name === voice) ? voice : firstVoice.name;

  const { wavBuffer } = await generateSpeechById({
    modelId: speechModel.id,
    text,
    voice: selectedVoice,
  });

  return { buffer: wavBuffer, contentType: 'audio/wav' };
}
