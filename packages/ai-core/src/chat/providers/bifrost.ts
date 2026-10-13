import { dbGetModelIdByProviderAndUpstreamName } from '@ais-chat/api-database';
import { instrumentOpenAiClient } from '@sentry/server-utils';
import OpenAI from 'openai';
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

/**
 * Bifrost-specific routed-identity fields: the real upstream provider/model that served a
 * request. Deliberately sourced only from the `x-bifrost-*` response headers (see
 * `extractBifrostFieldsFromHeaders`), not from the response body's `extra_fields`.
 *
 * Bifrost's own source notes that streamed chunks only carry `extra_fields` inconsistently (see
 * `ApplyBifrostStreamResponseHeaders` in bifrost's transport layer), and in practice the body can
 * carry a stale, empty snapshot instead of the final value on our main agentic streaming flow —
 * exactly where this information is needed to report the real provider/model on the
 * `new_chat_message` event. The headers are emitted before the SSE body starts and are Bifrost's
 * documented, reliable mechanism for recovering routed identity, so they're used exclusively.
 */
type BifrostExtraFields = {
  provider?: string;
  // Bifrost returns the originally requested model and the deployment that served it.
  // The deployment may identify a fallback, but it can also be an upstream-specific alias.
  original_model_requested?: string;
  resolved_model_used?: string;
};

// `x-bifrost-routing-info-*` are the current headers; the `x-bifrost-provider`/
// `x-bifrost-original-model`/`x-bifrost-resolved-model` headers are deprecated but still emitted
// for backward compatibility, so they're used as a fallback here.
const BIFROST_PROVIDER_HEADERS = ['x-bifrost-routing-info-provider', 'x-bifrost-provider'];
const BIFROST_REQUESTED_MODEL_HEADERS = [
  'x-bifrost-routing-info-requested-model',
  'x-bifrost-original-model',
];
const BIFROST_RESOLVED_MODEL_HEADERS = ['x-bifrost-routing-info-model', 'x-bifrost-resolved-model'];

function getFirstHeader(headers: Headers, names: string[]): string | undefined {
  for (const name of names) {
    const value = headers.get(name);
    if (value) return value;
  }
  return undefined;
}

// Reads the routed-identity headers Bifrost emits on every successful response (streaming
// included) before the body starts. See the comment on `BifrostExtraFields` for why this is the
// sole source, instead of the response body's `extra_fields`.
function extractBifrostFieldsFromHeaders(headers: Headers): BifrostExtraFields {
  return {
    provider: getFirstHeader(headers, BIFROST_PROVIDER_HEADERS),
    original_model_requested: getFirstHeader(headers, BIFROST_REQUESTED_MODEL_HEADERS),
    resolved_model_used: getFirstHeader(headers, BIFROST_RESOLVED_MODEL_HEADERS),
  };
}

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
  const modelName =
    deployment && fields.provider && deployment.startsWith(`${fields.provider}/`)
      ? deployment.slice(fields.provider.length + 1)
      : deployment;

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
