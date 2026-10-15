import { instrumentOpenAiClient } from '@sentry/server-utils';
import OpenAI, { toFile } from 'openai';
import { extractBifrostFieldsFromHeaders, stripBifrostProviderPrefix } from '../../bifrost-headers';
import type { AiModel, ImageGenerationFn, ImageResponse } from '../types';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import { env } from '../../env';

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

function mapBifrostResult(result: OpenAI.Images.ImagesResponse, headers: Headers): ImageResponse {
  if (!result.data || result.data.length === 0) {
    throw new AiGenerationError('No image data received from Bifrost');
  }

  const data = result.data
    .map((item) => item.b64_json)
    .filter((item): item is string => item !== undefined);

  if (data.length === 0) {
    throw new AiGenerationError('No image data received from Bifrost');
  }

  const fields = extractBifrostFieldsFromHeaders(headers);
  const deployment = fields.resolved_model_used ?? fields.original_model_requested;

  return {
    data,
    output_format: result.output_format,
    usage: result.usage
      ? {
          input_text_tokens: result.usage.input_tokens_details.text_tokens,
          input_image_tokens: result.usage.input_tokens_details.image_tokens ?? 0,
          output_text_tokens: result.usage.output_tokens_details?.text_tokens,
          output_image_tokens: result.usage.output_tokens_details?.image_tokens ?? 0,
        }
      : undefined,
    provider: fields.provider,
    modelName: stripBifrostProviderPrefix(deployment, fields.provider),
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
      const { data: editResult, response: httpResponse } = await client.images
        .edit({
          model: modelName,
          prompt,
          n: 1,
          size,
          quality: 'medium',
          image: uploadables,
        })
        .withResponse();
      return mapBifrostResult(editResult, httpResponse.headers);
    }

    const { data: result, response: httpResponse } = await client.images
      .generate({
        model: modelName,
        prompt,
        n: 1,
        size,
        quality: 'medium',
      })
      .withResponse();
    return mapBifrostResult(result, httpResponse.headers);
  };
}
