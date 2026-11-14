import {
  dbCreateLlmModel,
  dbDeleteLlmModel,
  dbGetAllModels,
  dbReplaceModelProviderKeyMappings,
  dbUpdateLlmModel,
} from '@ais-chat/api-database';
import { imageGenerationConfigSchema, speechConfigSchema } from '@ais-chat/api-database/types';
import { llmModelPriceMetadataSchema } from '@ais-chat/shared/db/schema';
import { logInfo } from '@shared/logging';
import { z } from 'zod';

import { runDeleteOrThrowError } from '@/utils/run-delete-or-throw-error';

import { CreateLargeLanguageModel, UpdateLargeLanguageModel } from '../types/large-language-model';
import { syncBifrostProvidersOrThrow } from './bifrost-provider-sync-service';

const supportedImageFormatsSchema = z.array(z.string());

export async function getLargeLanguageModels() {
  return dbGetAllModels();
}

export async function createLargeLanguageModel(data: CreateLargeLanguageModel) {
  const existingModels = await dbGetAllModels();
  if (existingModels.some(({ name }) => name === data.name)) {
    throw new Error('A model with this name already exists');
  }

  const model = await dbCreateLlmModel({
    name: data.name,
    displayName: data.displayName,
    provider: 'bifrost',
    description: data.description ?? '',
    setting: { provider: 'bifrost' },
    priceMetadata: llmModelPriceMetadataSchema.parse(JSON.parse(data.priceMetadata)),
    supportedImageFormats: data.supportedImageFormats
      ? supportedImageFormatsSchema.parse(JSON.parse(data.supportedImageFormats))
      : [],
    imageGenerationConfig: data.imageGenerationConfig
      ? imageGenerationConfigSchema.parse(JSON.parse(data.imageGenerationConfig))
      : undefined,
    modelConfig: data.modelConfig
      ? speechConfigSchema.parse(JSON.parse(data.modelConfig))
      : undefined,
    additionalParameters: data.additionalParameters ? JSON.parse(data.additionalParameters) : {},
    isNew: data.isNew,
    isDeleted: data.isDeleted,
    useBifrost: data.useBifrost,
    safetyFilterEnabled: data.safetyFilterEnabled,
  });

  logInfo('LLM was created successfully', { data });

  if (!model) throw new Error('Failed to create model');
  await dbReplaceModelProviderKeyMappings({
    modelId: model.id,
    providerKeys: data.providerKeys,
  });
  await syncBifrostProvidersOrThrow();
  return model;
}

export async function updateLargeLanguageModel(modelId: string, data: UpdateLargeLanguageModel) {
  const existingModels = await dbGetAllModels();
  if (existingModels.some(({ id, name }) => id !== modelId && name === data.name)) {
    throw new Error('A model with this name already exists');
  }

  const model = await dbUpdateLlmModel(modelId, {
    name: data.name,
    displayName: data.displayName,
    provider: 'bifrost',
    description: data.description,
    setting: { provider: 'bifrost' },
    priceMetadata: llmModelPriceMetadataSchema.parse(JSON.parse(data.priceMetadata)),
    supportedImageFormats: data.supportedImageFormats
      ? supportedImageFormatsSchema.parse(JSON.parse(data.supportedImageFormats))
      : undefined,
    imageGenerationConfig: data.imageGenerationConfig
      ? imageGenerationConfigSchema.parse(JSON.parse(data.imageGenerationConfig))
      : undefined,
    modelConfig: data.modelConfig
      ? speechConfigSchema.parse(JSON.parse(data.modelConfig))
      : undefined,
    additionalParameters: data.additionalParameters
      ? JSON.parse(data.additionalParameters)
      : undefined,
    isNew: data.isNew,
    isDeleted: data.isDeleted,
    useBifrost: data.useBifrost,
    safetyFilterEnabled: data.safetyFilterEnabled,
  });

  await dbReplaceModelProviderKeyMappings({
    modelId,
    providerKeys: data.providerKeys,
  });

  await syncBifrostProvidersOrThrow();
  if (!model) throw new Error('Failed to update model');

  logInfo('LLM was updated successfully', { modelId, data });

  return model;
}

export async function deleteLargeLanguageModel(modelId: string) {
  const deleted = await runDeleteOrThrowError(
    () => dbDeleteLlmModel(modelId),
    'Sprachmodell kann nicht gelöscht werden, da noch Daten damit verknüpft sind.',
  );
  if (!deleted) throw new Error('Model not found');

  await syncBifrostProvidersOrThrow();

  logInfo('LLM was deleted successfully', { modelId });
}
