import {
  dbCreateLlmModel,
  dbDeleteLlmModel,
  dbGetAllModels,
  dbReplaceModelProviderKeyMappings,
  dbUpdateLlmModel,
  type LlmInsertModel,
} from '@ais-chat/api-database';
import {
  imageGenerationConfigSchema,
  speechConfigSchema,
  supportedImageFormatsSchema,
} from '@ais-chat/api-database/types';
import { llmModelPriceMetadataSchema } from '@ais-chat/shared/db/schema';
import { logInfo } from '@shared/logging';

import { runDeleteOrThrowError } from '@/utils/run-delete-or-throw-error';

import { syncBifrostProvidersOrThrow } from './bifrost-provider-sync-service';

export async function getLargeLanguageModels() {
  return dbGetAllModels();
}

export type LlmModelInput = Omit<LlmInsertModel, 'id' | 'createdAt' | 'provider' | 'setting'> & {
  providerKeys: { providerKeyId: string; upstreamModelName: string }[];
};

function toLlmModelValues(data: LlmModelInput) {
  return {
    name: data.name,
    displayName: data.displayName,
    provider: 'bifrost',
    description: data.description ?? '',
    setting: { provider: 'bifrost' } as const,
    priceMetadata: llmModelPriceMetadataSchema.parse(data.priceMetadata),
    supportedImageFormats: supportedImageFormatsSchema.parse(data.supportedImageFormats ?? []),
    imageGenerationConfig: data.imageGenerationConfig
      ? imageGenerationConfigSchema.parse(data.imageGenerationConfig)
      : null,
    modelConfig: data.modelConfig ? speechConfigSchema.parse(data.modelConfig) : null,
    additionalParameters: data.additionalParameters ?? {},
    vendor: data.vendor ?? null,
    reasoning: data.reasoning ?? null,
    isNew: data.isNew,
    isDeleted: data.isDeleted,
    useBifrost: data.useBifrost,
    safetyFilterEnabled: data.safetyFilterEnabled,
  };
}

export async function createLargeLanguageModel(data: LlmModelInput) {
  const existingModels = await dbGetAllModels();
  if (existingModels.some(({ name }) => name === data.name)) {
    throw new Error('A model with this name already exists');
  }

  const model = await dbCreateLlmModel(toLlmModelValues(data));

  logInfo('LLM was created successfully', { data });

  if (!model) throw new Error('Failed to create model');
  await dbReplaceModelProviderKeyMappings({
    modelId: model.id,
    providerKeys: data.providerKeys,
  });
  await syncBifrostProvidersOrThrow();
  return model;
}

export async function updateLargeLanguageModel(modelId: string, data: LlmModelInput) {
  const existingModels = await dbGetAllModels();
  if (existingModels.some(({ id, name }) => id !== modelId && name === data.name)) {
    throw new Error('A model with this name already exists');
  }

  const model = await dbUpdateLlmModel(modelId, toLlmModelValues(data));

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
