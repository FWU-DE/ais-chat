import type { SensitiveLlmModel } from '@ais-chat/api-database';
import { llmModelPublicSchema } from '@ais-chat/api-database/types';

type PublicLlmModel = Omit<SensitiveLlmModel, 'setting' | 'modelConfig'> & {
  modelConfig: Pick<NonNullable<SensitiveLlmModel['modelConfig']>, 'voices'> | null;
};

export function obscureModels(models: SensitiveLlmModel[]): PublicLlmModel[] {
  return models.map((model) => llmModelPublicSchema.parse(model) as PublicLlmModel);
}
