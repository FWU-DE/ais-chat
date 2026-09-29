import { instrumentOpenAiClient } from '@sentry/core';
import OpenAI from 'openai';
import type { AiModel, EmbeddingGenerationFn } from '../types';
import { ProviderConfigurationError } from '../../errors';
import { env } from '../../env';
import { EMBEDDING_CLIENT_MAX_RETRIES, EMBEDDING_CLIENT_TIMEOUT_MS } from './const';

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
        timeout: EMBEDDING_CLIENT_TIMEOUT_MS,
        maxRetries: EMBEDDING_CLIENT_MAX_RETRIES,
      }),
    ),
    modelName: model.name,
  };
}

export function constructBifrostEmbeddingGenerationFn(model: AiModel): EmbeddingGenerationFn {
  const { client, modelName } = createBifrostClient(model);

  return async function getBifrostEmbedding({ texts }) {
    const response = await client.embeddings.create({
      model: modelName,
      input: texts,
      encoding_format: 'float',
    });

    const embeddings = response.data.map((element) => element.embedding);
    return {
      embeddings,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  };
}
