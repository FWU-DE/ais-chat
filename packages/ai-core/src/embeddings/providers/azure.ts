import { instrumentOpenAiClient } from '@sentry/core';
import OpenAI from 'openai';
import type { AiModel, EmbeddingGenerationFn } from '../types';
import { ProviderConfigurationError } from '../../errors';
import { EMBEDDING_CLIENT_MAX_RETRIES, EMBEDDING_CLIENT_TIMEOUT_MS } from './const';

function createAzureClient(model: AiModel): {
  client: OpenAI;
  deployment: string;
} {
  if (model.setting.provider !== 'azure') {
    throw new ProviderConfigurationError('Invalid model configuration for Azure');
  }

  const { basePath, deployment, searchParams } = parseAzureOpenAIUrl({
    baseUrl: model.setting.baseUrl,
  });

  const client = instrumentOpenAiClient(
    new OpenAI({
      apiKey: model.setting.apiKey,
      baseURL: basePath,
      defaultQuery: Object.fromEntries(searchParams.entries()),
      timeout: EMBEDDING_CLIENT_TIMEOUT_MS,
      maxRetries: EMBEDDING_CLIENT_MAX_RETRIES,
    }),
  );

  return { client, deployment };
}

export function constructAzureEmbeddingGenerationFn(model: AiModel): EmbeddingGenerationFn {
  const { client, deployment } = createAzureClient(model);

  return async function getAzureEmbedding({ texts }) {
    const response = await client.embeddings.create({
      model: deployment,
      input: texts,
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

function parseAzureOpenAIUrl({ baseUrl }: { baseUrl: string }): {
  basePath: string;
  deployment: string;
  searchParams: URLSearchParams;
} {
  // Extract query parameters if they exist
  const [urlWithoutQuery, ...queryString] = baseUrl.split('?');

  if (urlWithoutQuery === undefined) {
    throw new ProviderConfigurationError('Invalid Azure baseUrl format.');
  }

  const searchParams = new URLSearchParams(queryString.join('?'));

  const urlParts = urlWithoutQuery.split('/');
  const deploymentIndex = urlParts.findIndex((part) => part === 'deployments');

  if (deploymentIndex === -1 || deploymentIndex >= urlParts.length - 1) {
    throw new ProviderConfigurationError(
      'Invalid Azure baseUrl format. Expected format: https://{endpoint}.openai.azure.com/openai/deployments/{deployment-id}',
    );
  }

  const deployment = urlParts[deploymentIndex + 1];
  if (deployment === undefined) {
    throw new ProviderConfigurationError(
      'Invalid Azure baseUrl format. Expected format: https://{endpoint}.openai.azure.com/openai/deployments/{deployment-id}',
    );
  }
  const basePath = urlParts.slice(0, deploymentIndex - 1).join('/');

  return { basePath, deployment, searchParams };
}
