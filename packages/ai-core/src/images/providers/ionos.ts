import { instrumentOpenAiClient } from '@sentry/server-utils';
import OpenAI from 'openai';
import type { AiModel, ImageGenerationFn } from '../types';
import { AiGenerationError } from '../../errors';

export function constructIonosImageGenerationFn(llmModel: AiModel): ImageGenerationFn {
  if (llmModel.setting.provider !== 'ionos') {
    throw new Error('Invalid model configuration for IONOS');
  }

  const client = instrumentOpenAiClient(
    new OpenAI({
      apiKey: llmModel.setting.apiKey,
      baseURL: llmModel.setting.baseUrl,
    }),
  );

  return async function getIonosImageGeneration({
    prompt,
    model,
  }: Parameters<ImageGenerationFn>[0]) {
    const result = await client.images.generate({
      model,
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    });

    if (!result.data || result.data.length === 0) {
      throw new AiGenerationError('No image data received from IONOS');
    }

    return {
      data: result.data
        .map((item) => item.b64_json)
        .filter((item): item is string => item !== undefined),
      output_format: result.output_format,
    };
  };
}
