import { generateSpeechById } from '@ais-chat/ai-core';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';

export async function generateSpeech({ text }: { text: string }) {
  const speechModel = await dbGetSpeechModel();

  if (!speechModel) {
    throw new Error('No speech model configured');
  }

  const { wavBuffer } = await generateSpeechById({
    modelId: speechModel.id,
    text,
    voice: 'Kore',
  });

  return { audioBase64: wavBuffer.toString('base64') };
}
