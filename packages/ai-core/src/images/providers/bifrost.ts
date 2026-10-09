import { normalizeBifrostProviderName } from '@ais-chat/api-database/llm-model';
import { instrumentOpenAiClient } from '@sentry/server-utils';
import OpenAI, { toFile } from 'openai';
import { env } from '../../env';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import type { AiModel, ImageGenerationFn, ImageResponse } from '../types';

function createBifrostClient(model: AiModel): {
  client: OpenAI;
  modelName: string;
} {
  if (model.provider !== 'bifrost') {
    throw new ProviderConfigurationError('Invalid model configuration for Bifrost');
  }

  if (!env.bifrostBaseUrl) {
    throw new ProviderConfigurationError('BIFROST_BASE_URL is not configured');
  }

  return {
    client: instrumentOpenAiClient(
      new OpenAI({
        apiKey: env.bifrostApiKey ?? 'not-needed',
        baseURL: env.bifrostBaseUrl,
        ...(env.bifrostApiKey ? { defaultHeaders: { 'x-bf-vk': env.bifrostApiKey } } : {}),
      }),
    ),
    modelName: model.name,
  };
}

function mapBifrostResult(result: OpenAI.Images.ImagesResponse): ImageResponse {
  if (!result.data || result.data.length === 0) {
    throw new AiGenerationError('No image data received from Bifrost');
  }

  const data = result.data
    .map((item) => item.b64_json)
    .filter((item): item is string => item !== undefined);

  if (data.length === 0) {
    throw new AiGenerationError('No image data received from Bifrost');
  }

  const provider = (result as typeof result & { extra_fields?: { provider?: string } }).extra_fields
    ?.provider;

  return {
    data,
    output_format: result.output_format,
    ...(provider ? { provider: normalizeBifrostProviderName(provider) } : {}),
    usage: result.usage
      ? {
          input_text_tokens: result.usage.input_tokens_details.text_tokens,
          input_image_tokens: result.usage.input_tokens_details.image_tokens ?? 0,
          output_text_tokens: result.usage.output_tokens_details?.text_tokens,
          output_image_tokens: result.usage.output_tokens_details?.image_tokens ?? 0,
        }
      : undefined,
  };
}

export function constructBifrostImageGenerationFn(model: AiModel): ImageGenerationFn {
  const { client, modelName } = createBifrostClient(model);

  return async function getBifrostImageGeneration({ prompt, options }) {
    const size = options?.size ?? 'auto';
    const inputImages = options?.inputImages ?? [];

    if (inputImages.length > 0) {
      const uploadables = await Promise.all(
        inputImages.map((img) => toFile(img.data, img.filename, { type: img.mimeType })),
      );
      const editResult = await client.images.edit({
        model: modelName,
        prompt,
        n: 1,
        size,
        quality: 'medium',
        image: uploadables,
      });
      return mapBifrostResult(editResult);
    }

    const result = await client.images.generate({
      model: modelName,
      prompt,
      n: 1,
      size,
      quality: 'medium',
    });
    return mapBifrostResult(result);
  };
}
