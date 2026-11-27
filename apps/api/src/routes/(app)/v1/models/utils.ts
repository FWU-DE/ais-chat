import type { LlmModelWithSecrets } from '@ais-chat/api-database';
import { llmModelPublicSchema } from '@ais-chat/api-database/types';

type PublicLlmModel = Omit<LlmModelWithSecrets, 'setting' | 'modelConfig'> & {
  modelConfig: Pick<NonNullable<LlmModelWithSecrets['modelConfig']>, 'voices'> | null;
};

export function obscureModels(models: LlmModelWithSecrets[]): PublicLlmModel[] {
  return models.map((model) => llmModelPublicSchema.parse(model) as PublicLlmModel);
}
