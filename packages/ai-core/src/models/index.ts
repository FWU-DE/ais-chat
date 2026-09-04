import { InvalidModelError } from '../errors';
import {
  dbGetDirectModelConfiguration,
  dbGetModelById,
  dbGetModelByNameAndApiKeyId,
} from '@ais-chat/api-database';
import { AiModel } from '../images/types';
import type { AiModel as TextAiModel } from '../chat/types';
import type { AiModel as EmbeddingAiModel } from '../embeddings/types';
import type { AiModel as SafetyAiModel } from '../safety/types';

export async function getImageModelById(modelId: string): Promise<AiModel> {
  const model = await dbGetModelById(modelId);
  if (!model) {
    throw new InvalidModelError(`Model with id ${modelId} not found`);
  }
  if (model.priceMetadata.type !== 'image') {
    throw new InvalidModelError(`Model with id ${modelId} is not an image model`);
  }
  return resolveRoutingModel(model);
}

export async function getTextModelById(modelId: string): Promise<TextAiModel> {
  const model = await dbGetModelById(modelId);
  if (!model) {
    throw new InvalidModelError(`Model with id ${modelId} not found`);
  }
  if (model.priceMetadata.type !== 'text') {
    throw new InvalidModelError(`Model with id ${modelId} is not a text model`);
  }
  return resolveRoutingModel(model);
}

export async function getEmbeddingModelById(modelId: string): Promise<EmbeddingAiModel> {
  const model = await dbGetModelById(modelId);
  if (!model) {
    throw new InvalidModelError(`Model with id ${modelId} not found`);
  }
  if (model.priceMetadata.type !== 'embedding') {
    throw new InvalidModelError(`Model with id ${modelId} is not an embedding model`);
  }
  return resolveRoutingModel(model);
}

export async function getSafetyModelById(modelId: string): Promise<SafetyAiModel> {
  const model = await dbGetModelById(modelId);
  if (!model) {
    throw new InvalidModelError(`Model with id ${modelId} not found`);
  }
  if (model.priceMetadata.type !== 'safety') {
    throw new InvalidModelError(`Model with id ${modelId} is not a safety model`);
  }
  return resolveRoutingModel(model);
}

export async function getTextModelByName(
  modelName: string,
  apiKeyId: string,
): Promise<TextAiModel> {
  const model = await dbGetModelByNameAndApiKeyId({ name: modelName, apiKeyId });
  if (!model) {
    throw new InvalidModelError(`No text model with name ${modelName} found for this API key`);
  }
  if (model.priceMetadata.type !== 'text') {
    throw new InvalidModelError(`Model ${modelName} is not a text model`);
  }
  return resolveRoutingModel(model);
}

export async function getEmbeddingModelByName(
  modelName: string,
  apiKeyId: string,
): Promise<EmbeddingAiModel> {
  const model = await dbGetModelByNameAndApiKeyId({ name: modelName, apiKeyId });
  if (!model) {
    throw new InvalidModelError(`No embedding model with name ${modelName} found for this API key`);
  }
  if (model.priceMetadata.type !== 'embedding') {
    throw new InvalidModelError(`Model ${modelName} is not an embedding model`);
  }
  return resolveRoutingModel(model);
}

export async function getSafetyModelByName(
  modelName: string,
  apiKeyId: string,
): Promise<SafetyAiModel> {
  const model = await dbGetModelByNameAndApiKeyId({ name: modelName, apiKeyId });
  if (!model) {
    throw new InvalidModelError(`No safety model with name ${modelName} found for this API key`);
  }
  if (model.priceMetadata.type !== 'safety') {
    throw new InvalidModelError(`Model ${modelName} is not a safety model`);
  }
  return resolveRoutingModel(model);
}

export async function getImageModelByName(modelName: string, apiKeyId: string): Promise<AiModel> {
  const model = await dbGetModelByNameAndApiKeyId({ name: modelName, apiKeyId });
  if (!model) {
    throw new InvalidModelError(`No image model with name ${modelName} found for this API key`);
  }
  if (model.priceMetadata.type !== 'image') {
    throw new InvalidModelError(`Model ${modelName} is not an image model`);
  }
  return resolveRoutingModel(model);
}

async function resolveRoutingModel<TModel extends { id: string; useBifrost: boolean }>(
  model: TModel,
): Promise<TModel> {
  if (model.useBifrost !== false) return model;
  const directModel = await dbGetDirectModelConfiguration(model.id);
  if (!directModel) {
    throw new InvalidModelError(
      `Model ${model.id} requires exactly one enabled provider key when Bifrost is disabled`,
    );
  }
  return directModel as unknown as TModel;
}
