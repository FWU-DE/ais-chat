import { LlmModel } from '@ais-chat/api-database';

type ObscuredLlmModel = Omit<LlmModel, 'setting'>;

export function obscureModels(models: LlmModel[]): ObscuredLlmModel[] {
  return models.map((model) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { setting, ...rest } = model;
    return rest;
  });
}
