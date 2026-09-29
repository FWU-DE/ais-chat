import { generateSpeechById } from '@ais-chat/ai-core';
import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';

export async function generateSpeech({
  text,
  federalStateId,
}: {
  text: string;
  federalStateId: string;
}) {
  const models = await dbGetLlmModelsByFederalStateId({ federalStateId });
  const speechModel = models.find((model) => model.priceMetadata.type === 'speech');

  if (!speechModel) {
    throw new Error('No speech model assigned to this federal state');
  }

  const { wavBuffer } = await generateSpeechById({
    modelId: speechModel.id,
    text,
    voice: 'Kore',
  });

  return { audioBase64: wavBuffer.toString('base64') };
}
