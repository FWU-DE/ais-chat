import {
  dbGetAllLlmModels,
  dbGetLlmModelById,
  dbFindModelByIdAndFederalStateId,
} from '@shared/db/functions/llm-model';
import { dbGetConfiguration, dbUpsertConfiguration } from '@shared/db/functions/configuration';
import {
  type LlmModelSelectModel,
  staticModelsConfigurationSchema,
  type StaticModelsConfiguration,
  type StaticModelRole,
} from '../db/schema';
import { InvalidArgumentError } from '@shared/error/invalid-argument-error';
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
  return dbFindModelByIdAndFederalStateId({
    modelId: configuration[role],
    federalStateId,
  });
}

export async function findStaticModelByRole(role: StaticModelRole) {
  const configuration = await getStaticModelsConfiguration();
  return configuration ? dbGetLlmModelById({ modelId: configuration[role] }) : undefined;
}

/** Resolves the globally configured safety model. */
export async function getSafetyModel() {
  const model = await findStaticModelByRole('safety');
  if (!model || model.isDeleted || model.priceMetadata.type !== 'safety') {
    throw new Error('No globally configured safety model found');
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
