import { OpenAI as OpenAIv4 } from 'openaiv4';
import type { AiModel, EmbeddingGenerationFn } from '../types';
import { ProviderConfigurationError } from '../../errors';
import { EMBEDDING_CLIENT_MAX_RETRIES, EMBEDDING_CLIENT_TIMEOUT_MS } from './const';

export function constructIonosEmbeddingGenerationFn(model: AiModel): EmbeddingGenerationFn {
  if (model.setting.provider !== 'ionos') {
    throw new ProviderConfigurationError('Invalid model configuration for IONOS');
  }

  // TODO: Still using old OpenAI v4 client for IONOS, replace with modern client when available
  const client = new OpenAIv4({
    apiKey: model.setting.apiKey,
    baseURL: model.setting.baseUrl,
    timeout: EMBEDDING_CLIENT_TIMEOUT_MS,
    maxRetries: EMBEDDING_CLIENT_MAX_RETRIES,
  });

  return async function getIonosEmbedding({ texts }) {
    if (texts.length === 0) {
      return {
        embeddings: [],
      };
    }

    const response = await client.embeddings.create({
      input: texts,
      model: model.name,
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
