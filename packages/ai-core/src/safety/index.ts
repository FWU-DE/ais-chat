import { hasAccessToModel } from '../api-keys/model-access';
import { InvalidModelError } from '../errors';
import { getSafetyModelById, getSafetyModelByName } from '../models';
import { checkSafety } from './providers';

export { checkSafety } from './providers';
export type { SafetyResult } from './types';

export async function checkTextSafety(modelId: string, text: string, apiKeyId: string) {
  const model = await getSafetyModelById(modelId);
  if (!(await hasAccessToModel(apiKeyId, model))) {
    throw new InvalidModelError(`API key does not have access to the safety model: ${model.name}`);
  }

  // TODO: Add image inputs once the deployed Llama Guard endpoint supports them.
  return checkSafety(model, text);
}

export async function checkTextSafetyByName(modelName: string, text: string, apiKeyId: string) {
  const model = await getSafetyModelByName(modelName, apiKeyId);
  return checkTextSafety(model.id, text, apiKeyId);
}
