import { dbGetConfiguration, dbUpsertConfiguration } from '../functions/configuration';
import { dbGetAllLlmModels } from '../functions/llm-model';
import { staticModelsConfigurationSchema, StaticModelRole } from '../schema';
import { STATIC_MODELS_CONFIGURATION_KEY } from '@shared/llm-models/llm-model-service';
import { getFirstTextModel } from '@shared/llm-models/llm-model-utils';

const requiredModelNames: Record<Exclude<StaticModelRole, 'safety'>, string> = {
  'default-chat': 'gpt-5-mini',
  fallback: 'gpt-5-nano',
  auxiliary: 'gpt-4o-mini',
  'strong-auxiliary': 'gpt-5.5',
  'auxiliary-fallback': 'meta-llama/Llama-3.3-70B-Instruct',
  'default-image': 'imagen-4.0-generate-001',
};

export async function initializeStaticModelConfigurations() {
  const configuration = await dbGetConfiguration(STATIC_MODELS_CONFIGURATION_KEY);
  if (!configuration || !staticModelsConfigurationSchema.safeParse(configuration.value).success) {
    const models = await dbGetAllLlmModels();
    const firstTextModel = getFirstTextModel(models);
    const firstImageModel = models.find((model) => model.priceMetadata.type === 'image');
    const staticModelsConfiguration = Object.fromEntries(
      Object.entries(requiredModelNames).map(([role, modelName]) => {
        const model =
          models.find((candidate) => candidate.name === modelName) ??
          (role === 'default-image' ? firstImageModel : firstTextModel);
        if (!model) {
          throw new Error(`No model available to configure ${role}`);
        }
        return [role, model.id];
      }),
    );

    const safetyModel = models.find((model) => model.priceMetadata.type === 'safety');
    await dbUpsertConfiguration({
      key: STATIC_MODELS_CONFIGURATION_KEY,
      value: staticModelsConfigurationSchema.parse({
        ...staticModelsConfiguration,
        ...(safetyModel ? { safety: safetyModel.id } : {}),
      }),
    });
  }
}
