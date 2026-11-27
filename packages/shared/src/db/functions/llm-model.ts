import {
  getAllLlmModels,
  getLlmModelById,
  getLlmModelByName,
  getLlmModelsByApiKeyId,
  type LlmModel,
} from '@ais-chat/ai-core/models/llm-models';

import { dbGetFederalStateById } from './federal-state';

async function getModelsByFederalStateId(federalStateId: string): Promise<LlmModel[]> {
  const federalState = await dbGetFederalStateById(federalStateId);
  if (!federalState?.apiKeyId) return [];
  return getLlmModelsByApiKeyId(federalState.apiKeyId);
}

export async function dbGetLlmModelById({
  modelId,
}: {
  modelId: string | undefined;
}): Promise<LlmModel | undefined> {
  if (modelId === undefined) return undefined;
  return getLlmModelById(modelId);
}

export async function dbGetModelByName(name: string): Promise<LlmModel | undefined> {
  return getLlmModelByName(name);
}

export async function dbGetAllLlmModels(): Promise<LlmModel[]> {
  return getAllLlmModels();
}

export async function dbGetSpeechModel() {
  const models = await dbGetAllLlmModels();
  return models.find((model) => model.isDeleted === false && model.priceMetadata.type === 'speech');
}

/** Returns all non-deleted models the federal state's API key has access to. */
export async function dbGetLlmModelsByFederalStateId({
  federalStateId,
}: {
  federalStateId: string;
}): Promise<LlmModel[]> {
  const models = await getModelsByFederalStateId(federalStateId);
  return models.filter((model) => !model.isDeleted);
}

/** Finds a non-deleted model the federal state's API key has access to. */
export async function dbFindModelByIdAndFederalStateId({
  modelId,
  federalStateId,
}: {
  modelId: string;
  federalStateId: string;
}): Promise<LlmModel | undefined> {
  const models = await dbGetLlmModelsByFederalStateId({ federalStateId });
  return models.find((model) => model.id === modelId);
}

/** Finds a model the federal state's API key has access to, including deleted ones. */
export async function dbGetModelByIdAndFederalStateId({
  modelId,
  federalStateId,
}: {
  modelId: string;
  federalStateId: string;
}): Promise<LlmModel | undefined> {
  const models = await getModelsByFederalStateId(federalStateId);
  return models.find((model) => model.id === modelId);
}
