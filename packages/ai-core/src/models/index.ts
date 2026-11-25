import {
  dbGetDirectModelConfiguration,
  dbGetModelById,
  dbGetModelByNameAndApiKeyId,
} from '@ais-chat/api-database';

import type { AiModel as TextAiModel } from '../chat/types';
import type { AiModel as EmbeddingAiModel } from '../embeddings/types';
import { InvalidModelError } from '../errors';
import type { AiModel as ImageAiModel } from '../images/types';
import type { AiModel as SafetyAiModel } from '../safety/types';
import type { AiModel as SpeechAiModel } from '../speech/types';

type ModelType = 'text' | 'image' | 'embedding' | 'safety' | 'speech';

type ModelByType = {
  text: TextAiModel;
  image: ImageAiModel;
  embedding: EmbeddingAiModel;
  safety: SafetyAiModel;
  speech: SpeechAiModel;
};

export async function getImageModelById(modelId: string): Promise<ImageAiModel> {
  return getModelById(modelId, 'image');
}

export async function getTextModelById(modelId: string): Promise<TextAiModel> {
  return getModelById(modelId, 'text');
}

export async function getEmbeddingModelById(modelId: string): Promise<EmbeddingAiModel> {
  return getModelById(modelId, 'embedding');
}

export async function getSafetyModelById(modelId: string): Promise<SafetyAiModel> {
  return getModelById(modelId, 'safety');
}

export async function getSpeechModelById(modelId: string): Promise<SpeechAiModel> {
  return getModelById(modelId, 'speech');
}

export async function getTextModelByName(
  modelName: string,
  apiKeyId: string,
): Promise<TextAiModel> {
  return getModelByName(modelName, apiKeyId, 'text');
}

export async function getEmbeddingModelByName(
  modelName: string,
  apiKeyId: string,
): Promise<EmbeddingAiModel> {
  return getModelByName(modelName, apiKeyId, 'embedding');
}

export async function getSafetyModelByName(
  modelName: string,
  apiKeyId: string,
): Promise<SafetyAiModel> {
  return getModelByName(modelName, apiKeyId, 'safety');
}

export async function getImageModelByName(
  modelName: string,
  apiKeyId: string,
): Promise<ImageAiModel> {
  return getModelByName(modelName, apiKeyId, 'image');
}

export async function getSpeechModelByName(
  modelName: string,
  apiKeyId: string,
): Promise<SpeechAiModel> {
  return getModelByName(modelName, apiKeyId, 'speech');
}

async function getModelById<T extends ModelType>(
  modelId: string,
  type: T,
): Promise<ModelByType[T]> {
  const model = await dbGetModelById(modelId);
  if (!model) {
    throw new InvalidModelError(`Model with id ${modelId} not found`);
  }
  if (model.priceMetadata.type !== type) {
    throw new InvalidModelError(`Model with id ${modelId} is not of type ${type}`);
  }
  return resolveRoutingModel(model) as Promise<ModelByType[T]>;
}

async function getModelByName<T extends ModelType>(
  modelName: string,
  apiKeyId: string,
  type: T,
): Promise<ModelByType[T]> {
  const model = await dbGetModelByNameAndApiKeyId({ name: modelName, apiKeyId });
  if (!model) {
    throw new InvalidModelError(`No ${type} model with name ${modelName} found for this API key`);
  }
  if (model.priceMetadata.type !== type) {
    throw new InvalidModelError(`Model ${modelName} is not of type ${type}`);
  }
  return resolveRoutingModel(model) as Promise<ModelByType[T]>;
}

async function resolveRoutingModel<TModel extends { id: string; useBifrost: boolean }>(
  model: TModel,
): Promise<TModel> {
  if (model.useBifrost !== false) {
    return model;
  }
  const directModel = await dbGetDirectModelConfiguration(model.id);
  if (!directModel) {
    throw new InvalidModelError(
      `Model ${model.id} requires exactly one enabled provider key when Bifrost is disabled`,
    );
  }
  return directModel as unknown as TModel;
}
