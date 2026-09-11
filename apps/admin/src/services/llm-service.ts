import {
  dbGetAllModelsByOrganizationId,
  dbCreateLlmModel,
  dbUpdateLlmModel,
  dbGetOrganizationById,
  dbReplaceModelProviderKeyMappings,
} from '@ais-chat/api-database';
import { CreateLargeLanguageModel, UpdateLargeLanguageModel } from '../types/large-language-model';
import { logInfo } from '@shared/logging';
import { syncBifrostProvidersForOrganization } from './bifrost-provider-sync-service';

export async function getLargeLanguageModels(organizationId: string) {
  return dbGetAllModelsByOrganizationId(organizationId);
}

export async function createLargeLanguageModel(
  organizationId: string,
  data: CreateLargeLanguageModel,
) {
  const organization = await dbGetOrganizationById(organizationId);
  if (!organization) throw new Error('Organization not found');
  const existingModels = await dbGetAllModelsByOrganizationId(organizationId);
  if (existingModels.some(({ name }) => name === data.name)) {
    throw new Error('A model with this name already exists for this organization');
  }

  const model = await dbCreateLlmModel({
    name: data.name,
    displayName: data.displayName,
    provider: 'bifrost',
    description: data.description ?? '',
    setting: { provider: 'bifrost' },
    priceMetadata: data.priceMetadata
      ? JSON.parse(data.priceMetadata)
      : { type: 'text' as const, completionTokenPrice: 0, promptTokenPrice: 0 },
    supportedImageFormats: data.supportedImageFormats ? JSON.parse(data.supportedImageFormats) : [],
    imageGenerationConfig: data.imageGenerationConfig
      ? JSON.parse(data.imageGenerationConfig)
      : undefined,
    additionalParameters: data.additionalParameters ? JSON.parse(data.additionalParameters) : {},
    organizationId,
    isNew: data.isNew,
    isDeleted: data.isDeleted,
    useBifrost: data.useBifrost,
    safetyFilterEnabled: data.safetyFilterEnabled,
  });

  logInfo('LLM was created successfully', { organizationId, data });

  if (!model) throw new Error('Failed to create model');
  await dbReplaceModelProviderKeyMappings({
    modelId: model.id,
    organizationId,
    providerKeys: data.providerKeys,
  });
  await syncBifrostProvidersForOrganization(organizationId);
  return model;
}

export async function updateLargeLanguageModel(
  organizationId: string,
  modelId: string,
  data: UpdateLargeLanguageModel,
) {
  const existingModels = await dbGetAllModelsByOrganizationId(organizationId);
  if (existingModels.some(({ id, name }) => id !== modelId && name === data.name)) {
    throw new Error('A model with this name already exists for this organization');
  }

  const model = await dbUpdateLlmModel(modelId, organizationId, {
    name: data.name,
    displayName: data.displayName,
    provider: 'bifrost',
    description: data.description,
    setting: { provider: 'bifrost' },
    priceMetadata: data.priceMetadata ? JSON.parse(data.priceMetadata) : undefined,
    supportedImageFormats: data.supportedImageFormats
      ? JSON.parse(data.supportedImageFormats)
      : undefined,
    imageGenerationConfig: data.imageGenerationConfig
      ? JSON.parse(data.imageGenerationConfig)
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
    organizationId,
    providerKeys: data.providerKeys,
  });

  await syncBifrostProvidersForOrganization(organizationId);
  if (!model) throw new Error('Failed to update model');

  logInfo('LLM was updated successfully', { organizationId, modelId, data });

  return model;
}
