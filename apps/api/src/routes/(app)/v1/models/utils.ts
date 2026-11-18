import { SensitiveLlmModel } from '@ais-chat/api-database';

type ObscuredLlmModel = Omit<SensitiveLlmModel, 'setting' | 'modelConfig'> & {
  modelConfig: { voices: Array<{ name: string; displayName: string }> } | null;
};

export function obscureModels(models: SensitiveLlmModel[]): ObscuredLlmModel[] {
  return models.map((model) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { setting, modelConfig, ...rest } = model;
    return {
      ...rest,
      modelConfig: modelConfig === null ? null : { voices: modelConfig.voices },
    };
  });
}
