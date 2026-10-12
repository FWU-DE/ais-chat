import { generateSpeechById } from '@ais-chat/ai-core';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';
import { InvalidArgumentError } from '@shared/error';
import { calculateSpeechCostsInCent } from '@/app/api/utils/utils';

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

  const { wavBuffer, usage } = await generateSpeechById({
    modelId: speechModel.id,
    text,
    voice: selectedVoice,
  });

  const costsInCent = calculateSpeechCostsInCent(speechModel, usage);

  return {
    buffer: wavBuffer,
    contentType: 'audio/wav',
    costsInCent,
    usage,
    modelId: speechModel.id,
    provider: speechModel.provider,
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

  const { wavBuffer } = await generateSpeechById({
    modelId: speechModel.id,
    text,
    voice,
  });

  return {
    buffer: wavBuffer,
    contentType: 'audio/wav',
  };
}
