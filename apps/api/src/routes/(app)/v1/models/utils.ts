import { SensitiveLlmModel } from '@ais-chat/api-database';

type ObscuredLlmModel = Omit<SensitiveLlmModel, 'setting'>;

export function obscureModels(models: SensitiveLlmModel[]): ObscuredLlmModel[] {
  return models.map((model) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { setting, ...rest } = model;
    return rest;
  });
}
