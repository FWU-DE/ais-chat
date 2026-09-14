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
import { env } from '../../env';
import { dbGetModelIdByProviderAndUpstreamName } from '@ais-chat/api-database';

type BifrostExtraFields = {
  provider?: string;
  // Bifrost returns the originally requested model and the deployment that served it.
  // The deployment may identify a fallback, but it can also be an upstream-specific alias.
  model_requested?: string;
  model_deployment?: string;
};

function createBifrostClient(model: AiModel): { client: OpenAI; modelName: string } {
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
    modelName: getBifrostModelName(model),
  };
}

// Temporary until the other provider paths are removed and all requests use Bifrost.
function getBifrostModelName(model: AiModel): string {
  return model.name.replace(/^anthropic\//, '');
}

async function getUsedModelId(
  extraFields: unknown,
  models: AiModel[],
): Promise<string | undefined> {
  if (!extraFields || typeof extraFields !== 'object') return undefined;
  const fields = extraFields as BifrostExtraFields;
  const returnedNames = [fields.model_deployment, fields.model_requested].filter(
    (value): value is string => typeof value === 'string',
  );
  for (const returnedName of returnedNames) {
    const matchingModel = models.find((candidate) => {
      const candidateName = getBifrostModelName(candidate);
      return returnedName === candidateName || returnedName.endsWith(`/${candidateName}`);
    });
    if (matchingModel) return matchingModel.id;
  }
  if (fields.provider && fields.model_deployment) {
    const upstreamModelName = fields.model_deployment.replace(`${fields.provider}/`, '');
    return dbGetModelIdByProviderAndUpstreamName({
      modelIds: models.map(({ id }) => id),
      provider: fields.provider,
      upstreamModelName,
    });
  }
  return undefined;
}

export function constructBifrostTextStreamFn(model: AiModel): TextStreamFn {
  const { client, modelName } = createBifrostClient(model);

  return async function* getBifrostTextStream(
    { messages, maxTokens, fallbackModels, abortSignal },
    onComplete,
  ) {
    const response = await client.responses.create(
      {
        model: modelName,
        input: toOpenAIResponsesInput(messages),
        stream: true,
        max_output_tokens: maxTokens,
        ...model.additionalParameters,
        ...(fallbackModels?.length ? { fallbacks: fallbackModels.map(getBifrostModelName) } : {}),
      },
      { signal: abortSignal },
    );

    let usage: TokenUsage | undefined;
    let modelId: string | undefined;

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
        modelId = await getUsedModelId(
          (event.response as typeof event.response & { extra_fields?: unknown }).extra_fields,
          [model, ...(fallbackModels ?? [])],
        );
      }
    }

    if (!usage) {
      throw new AiGenerationError('No usage data returned from Bifrost stream');
    }

    if (onComplete) {
      if (modelId) {
        await onComplete(usage, modelId);
      } else {
        await onComplete(usage);
      }
    }
  };
}

export function constructBifrostAgenticStreamFn(model: AiModel): AgenticStreamFn {
  const { client, modelName } = createBifrostClient(model);

  return async function* getBifrostAgenticStream({
    messages,
    maxTokens,
    tools,
    toolChoice,
    abortSignal,
    fallbackModels,
  }) {
    yield* streamOpenAICompatibleAgenticResponse({
      client,
      messages,
      modelName,
      maxTokens,
      tools,
      toolChoice,
      abortSignal,
      providerName: 'Bifrost',
      additionalParameters: {
        ...(model.additionalParameters as Record<string, unknown>),
        ...(fallbackModels?.length ? { fallbacks: fallbackModels.map(getBifrostModelName) } : {}),
      },
      getModelId: (extraFields) => getUsedModelId(extraFields, [model, ...(fallbackModels ?? [])]),
    });
  };
}

export function constructBifrostTextGenerationFn(model: AiModel): TextGenerationFn {
  const { client, modelName } = createBifrostClient(model);

  return async function getBifrostTextGeneration({
    messages,
    maxTokens,
    fallbackModels,
    abortSignal,
  }) {
    const response = await client.responses.create(
      {
        model: modelName,
        input: toOpenAIResponsesInput(messages),
        stream: false,
        max_output_tokens: maxTokens,
        ...model.additionalParameters,
        ...(fallbackModels?.length ? { fallbacks: fallbackModels.map(getBifrostModelName) } : {}),
      },
      { signal: abortSignal },
    );

    const textOutput = response.output.find((item) => item.type === 'message');
    const text =
      textOutput?.type === 'message'
        ? textOutput.content
            .filter((content) => content.type === 'output_text')
            .map((content) => (content.type === 'output_text' ? content.text : ''))
            .join('')
        : '';

    const usage = response.usage;

    if (!usage) {
      throw new AiGenerationError('No usage data returned from Bifrost');
    }

    return {
      text,
      usage: {
        completionTokens: usage.output_tokens,
        promptTokens: usage.input_tokens,
        totalTokens: usage.total_tokens,
      },
      modelId: await getUsedModelId(
        (response as typeof response & { extra_fields?: unknown }).extra_fields,
        [model, ...(fallbackModels ?? [])],
      ),
    };
  };
}
