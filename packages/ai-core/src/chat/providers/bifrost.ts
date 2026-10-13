import { dbGetModelIdByProviderAndUpstreamName } from '@ais-chat/api-database';
import { instrumentOpenAiClient } from '@sentry/server-utils';
import OpenAI from 'openai';
import {
  extractBifrostFieldsFromHeaders,
  stripBifrostProviderPrefix,
  type BifrostExtraFields,
} from '../../bifrost-headers';
import { env } from '../../env';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import type {
  AgenticStreamFn,
  AiModel,
  TextGenerationFn,
  TextStreamFn,
  TokenUsage,
} from '../types';
import { toOpenAIResponsesInput } from '../utils';
import { streamOpenAICompatibleAgenticResponse } from './openai-compatible';

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

type BifrostUsageInfo = {
  modelId?: string;
  /** The real upstream provider that served the request, as reported by Bifrost. */
  provider?: string;
  /** The real upstream model name that served the request, as reported by Bifrost. */
  modelName?: string;
};

async function resolveBifrostUsageInfo(
  fields: BifrostExtraFields,
  models: AiModel[],
): Promise<BifrostUsageInfo> {
  // The deployment identifies the model that actually served the request (it may differ from
  // the one requested when a fallback kicked in), so prefer it over the requested model name.
  const deployment = fields.resolved_model_used ?? fields.original_model_requested;
  const modelName = stripBifrostProviderPrefix(deployment, fields.provider);

  const returnedNames = [fields.resolved_model_used, fields.original_model_requested].filter(
    (value): value is string => typeof value === 'string',
  );
  for (const returnedName of returnedNames) {
    const matchingModel = models.find((candidate) => {
      const candidateName = getBifrostModelName(candidate);
      return returnedName === candidateName || returnedName.endsWith(`/${candidateName}`);
    });
    if (matchingModel) return { modelId: matchingModel.id, provider: fields.provider, modelName };
  }
  if (fields.provider && fields.resolved_model_used) {
    const upstreamModelName = fields.resolved_model_used.replace(`${fields.provider}/`, '');
    const modelId = await dbGetModelIdByProviderAndUpstreamName({
      modelIds: models.map(({ id }) => id),
      provider: fields.provider,
      upstreamModelName,
    });
    return { modelId, provider: fields.provider, modelName };
  }
  return { provider: fields.provider, modelName };
}

export function constructBifrostTextStreamFn(model: AiModel): TextStreamFn {
  const { client, modelName } = createBifrostClient(model);

  return async function* getBifrostTextStream(
    { messages, maxTokens, fallbackModels, abortSignal },
    onComplete,
  ) {
    const { data: stream, response: httpResponse } = await client.responses
      .create(
        {
          model: modelName,
          input: toOpenAIResponsesInput(messages),
          stream: true,
          max_output_tokens: maxTokens,
          ...model.additionalParameters,
          ...(fallbackModels?.length ? { fallbacks: fallbackModels.map(getBifrostModelName) } : {}),
        },
        { signal: abortSignal },
      )
      .withResponse();
    const headerFields = extractBifrostFieldsFromHeaders(httpResponse.headers);

    let usage: TokenUsage | undefined;
    let modelId: string | undefined;

    for await (const event of stream) {
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
        ({ modelId } = await resolveBifrostUsageInfo(headerFields, [
          model,
          ...(fallbackModels ?? []),
        ]));
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
      getUsageInfo: (headers) =>
        resolveBifrostUsageInfo(extractBifrostFieldsFromHeaders(headers), [
          model,
          ...(fallbackModels ?? []),
        ]),
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
    const { data: response, response: httpResponse } = await client.responses
      .create(
        {
          model: modelName,
          input: toOpenAIResponsesInput(messages),
          stream: false,
          max_output_tokens: maxTokens,
          ...model.additionalParameters,
          ...(fallbackModels?.length ? { fallbacks: fallbackModels.map(getBifrostModelName) } : {}),
        },
        { signal: abortSignal },
      )
      .withResponse();

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

    const headerFields = extractBifrostFieldsFromHeaders(httpResponse.headers);

    return {
      text,
      usage: {
        completionTokens: usage.output_tokens,
        promptTokens: usage.input_tokens,
        totalTokens: usage.total_tokens,
      },
      modelId: (await resolveBifrostUsageInfo(headerFields, [model, ...(fallbackModels ?? [])]))
        .modelId,
    };
  };
}
