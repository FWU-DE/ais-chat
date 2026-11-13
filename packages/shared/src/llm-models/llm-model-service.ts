import { dbGetConfiguration, dbUpsertConfiguration } from '@shared/db/functions/configuration';
import {
  dbFindModelByIdAndFederalStateId,
  dbGetAllLlmModels,
  dbGetLlmModelById,
  dbGetLlmModelsByFederalStateId,
  dbGetSpeechModel,
} from '@shared/db/functions/llm-model';
import { InvalidArgumentError } from '@shared/error/invalid-argument-error';

import {
  type LlmModelSelectModel,
  type SpeechVoice,
  type StaticModelRole,
  type StaticModelsConfiguration,
  staticModelsConfigurationSchema,
} from '../db/schema';
import { getFirstTextModel } from './llm-model-utils';

export const STATIC_MODELS_CONFIGURATION_KEY = 'static_models';

export type StaticModelConfigurationInput = StaticModelsConfiguration;

/** Returns all models and the current static model configuration for administration. */
export async function getStaticModelConfiguration() {
  const [models, configuration] = await Promise.all([
    dbGetAllLlmModels(),
    dbGetConfiguration(STATIC_MODELS_CONFIGURATION_KEY),
  ]);
  const parsedConfiguration = configuration
    ? staticModelsConfigurationSchema.safeParse(configuration.value)
    : undefined;
  return {
    models,
    configuration: parsedConfiguration?.success ? parsedConfiguration.data : undefined,
  };
}

/** Validates and persists a complete set of static model role assignments. */
export async function updateStaticModelConfiguration(input: unknown) {
  const configuration = staticModelsConfigurationSchema.safeParse(input);
  if (!configuration.success) {
    throw new InvalidArgumentError('Static model configuration is invalid.');
  }

  const models = await dbGetAllLlmModels();

  for (const [role, modelId] of Object.entries(configuration.data) as [StaticModelRole, string][]) {
    const model = models.find((candidate) => candidate.id === modelId);
    if (!model || model.isDeleted) {
      throw new InvalidArgumentError(`Configured model is not available: ${role}`);
    }

    const expectedType = role === 'default-image' ? 'image' : role === 'safety' ? 'safety' : 'text';
    if (model.priceMetadata.type !== expectedType) {
      throw new InvalidArgumentError(`Configured model type is invalid: ${role}`);
    }
  }

  return dbUpsertConfiguration({
    key: STATIC_MODELS_CONFIGURATION_KEY,
    value: configuration.data,
  });
}

/** Returns the available voices configured for the active speech model. */
export async function getSpeechModelVoices(): Promise<SpeechVoice[]> {
  const speechModel = await dbGetSpeechModel();
  return speechModel?.modelConfig?.voices ?? [];
}

/** Finds a configured model only when it is available to the given federal state. */
export async function findStaticModelByRoleAndFederalStateId({
  role,
  federalStateId,
}: {
  role: StaticModelRole;
  federalStateId: string;
}) {
  const configuration = await getStaticModelsConfiguration();
  if (!configuration) {
    return undefined;
  }
  const modelId = configuration[role];
  if (!modelId) {
    return undefined;
  }

  return dbFindModelByIdAndFederalStateId({
    modelId,
    federalStateId,
  });
}

export async function findStaticModelByRole(role: StaticModelRole) {
  const configuration = await getStaticModelsConfiguration();
  const modelId = configuration?.[role];
  return modelId ? dbGetLlmModelById({ modelId }) : undefined;
}

/** Resolves the globally configured safety model. */
export async function getSafetyModel() {
  const model = await findStaticModelByRole('safety');
  if (!model || model.isDeleted || model.priceMetadata.type !== 'safety') {
    return undefined;
  }

  return model;
}

/** Resolves the configured default chat model with a compatible text-model fallback. */
export async function getDefaultModel({
  federalStateId,
  models,
}: {
  federalStateId: string;
  models: LlmModelSelectModel[];
}): Promise<LlmModelSelectModel | undefined> {
  return (
    (await findStaticModelByRoleAndFederalStateId({ role: 'default-chat', federalStateId })) ??
    getFirstTextModel(models)
  );
}

/**
 * Resolves a stored text model for a federal state. Falls back to the federal state's default chat
 * model when the stored model was deleted, is not accessible by the federal state's API key or is
 * not a text model.
 */
export async function getModelByIdOrFallback({
  modelId,
  federalStateId,
}: {
  modelId: string;
  federalStateId: string;
}): Promise<LlmModelSelectModel | undefined> {
  const models = await dbGetLlmModelsByFederalStateId({ federalStateId });
  const model = models.find(
    (candidate) => candidate.id === modelId && candidate.priceMetadata.type === 'text',
  );
  return model ?? getDefaultModel({ federalStateId, models });
}

async function getStaticModelsConfiguration() {
  const configuration = await dbGetConfiguration(STATIC_MODELS_CONFIGURATION_KEY);
  const parsedConfiguration = configuration
    ? staticModelsConfigurationSchema.safeParse(configuration.value)
    : undefined;
  return parsedConfiguration?.success ? parsedConfiguration.data : undefined;
}

export async function getDefaultModelNameByFederalStateId(
  federalStateId: string,
  models: LlmModelSelectModel[],
) {
  const model = await getDefaultModel({ federalStateId, models });
  if (!model) {
    throw new Error(`No default text model found for federal state ${federalStateId}`);
  }
  return model.name;
}
