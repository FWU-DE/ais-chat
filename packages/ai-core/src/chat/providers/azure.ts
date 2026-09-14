import { instrumentOpenAiClient } from '@sentry/core';
import OpenAI from 'openai';
import type {
  AgenticStreamFn,
  AiModel,
  TextGenerationFn,
  TextStreamFn,
  TokenUsage,
} from '../types';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import { toOpenAIResponsesInput } from '../utils';
import { streamOpenAICompatibleAgenticResponse } from './openai-compatible';

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
      defaultQuery: {
        ...Object.fromEntries(searchParams.entries()),
        'api-version': '2025-04-01-preview',
      },
    }),
  );

  return { client, deployment };
}

/**
 * Alternative streaming function using the OpenAI Responses API
 * The Responses API provides a more flexible interface with built-in tool support
 */
export function constructAzureResponsesStreamFn(model: AiModel): TextStreamFn {
  const { client, deployment } = createAzureClient(model);

  return async function* getAzureTextStream({ messages, maxTokens, abortSignal }, onComplete) {
    const response = await client.responses.create(
      {
        model: deployment,
        input: toOpenAIResponsesInput(messages),
        stream: true,
        max_output_tokens: maxTokens,
        ...model.additionalParameters,
      },
      {
        path: `/openai/responses`,
        ...(abortSignal ? { signal: abortSignal } : {}),
      },
    );

    let usage: TokenUsage | undefined;

    for await (const event of response) {
      if (event.type === 'response.output_text.delta') {
        yield event.delta;
      }

      if (
        (event.type === 'response.completed' ||
          event.type === 'response.incomplete' ||
          event.type === 'response.failed') &&
        event.response.usage
      ) {
        usage = {
          completionTokens: event.response.usage.output_tokens,
          promptTokens: event.response.usage.input_tokens,
          totalTokens: event.response.usage.total_tokens,
        };
      }
    }

    if (!usage) {
      throw new AiGenerationError('No usage data returned from Azure OpenAI Responses API stream');
    }

    if (onComplete) {
      await onComplete(usage);
    }
  };
}

export function constructAzureResponsesAgenticStreamFn(model: AiModel): AgenticStreamFn {
  const { client, deployment } = createAzureClient(model);

  return async function* getAzureTextStream({
    messages,
    maxTokens,
    tools,
    toolChoice,
    abortSignal,
  }) {
    yield* streamOpenAICompatibleAgenticResponse({
      client,
      messages,
      modelName: deployment,
      maxTokens,
      tools,
      toolChoice,
      abortSignal,
      providerName: 'Azure OpenAI',
      createOptions: {
        path: `/openai/responses`,
      },
      additionalParameters: model.additionalParameters as Record<string, unknown>,
    });
  };
}

/**
 * Non-streaming function using the OpenAI Responses API.
 */
export function constructAzureResponsesGenerationFn(model: AiModel): TextGenerationFn {
  const { client, deployment } = createAzureClient(model);

  return async function getAzureTextGeneration({ messages, maxTokens, abortSignal }) {
    const response = await client.responses.create(
      {
        model: deployment,
        input: toOpenAIResponsesInput(messages),
        stream: false,
        max_output_tokens: maxTokens,
        ...model.additionalParameters,
      },
      {
        path: `/openai/responses`,
        ...(abortSignal ? { signal: abortSignal } : {}),
      },
    );

    // Extract text from output items
    const textOutput = response.output.find((item) => item.type === 'message');
    const text =
      textOutput?.type === 'message'
        ? textOutput.content
            .filter((c) => c.type === 'output_text')
            .map((c) => (c.type === 'output_text' ? c.text : ''))
            .join('')
        : '';

    const usage = response.usage;

    if (!usage) {
      throw new AiGenerationError('No usage data returned from Azure OpenAI Responses API');
    }

    return {
      text,
      usage: {
        completionTokens: usage.output_tokens,
        promptTokens: usage.input_tokens,
        totalTokens: usage.total_tokens,
      },
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
