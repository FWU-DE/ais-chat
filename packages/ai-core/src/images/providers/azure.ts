import { instrumentOpenAiClient } from '@sentry/core';
import * as Sentry from '@sentry/core';
import OpenAI, { toFile } from 'openai';
import type { AiModel, ImageGenerationFn } from '../types';
import { AiGenerationError, ProviderConfigurationError, ResponsibleAIError } from '../../errors';

const RESPONSIBLE_AI_ERROR_CODES = new Set([
  'moderation_blocked',
  'content_policy_violation',
  'ResponsibleAIPolicyViolation',
]);

type AzureImageGenerationError = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

function setUsageAttributes(span: Sentry.Span, usage: OpenAI.Images.ImagesResponse.Usage) {
  span.setAttribute('gen_ai.usage.input_tokens', usage.input_tokens);
  span.setAttribute('gen_ai.usage.output_tokens', usage.output_tokens);
  span.setAttribute('gen_ai.usage.total_tokens', usage.total_tokens);

  if (usage.output_tokens_details) {
    span.setAttribute('gen_ai.usage.output_text_tokens', usage.output_tokens_details.text_tokens);
    span.setAttribute('gen_ai.usage.output_image_tokens', usage.output_tokens_details.image_tokens);
  }
}

function isResponsibleAiPolicyError(
  error: unknown,
): error is AzureImageGenerationError & { code: string; message: string } {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const { code, message, status } = error as AzureImageGenerationError;

  if (typeof code !== 'string' || typeof message !== 'string') {
    return false;
  }

  if (status !== undefined && status !== 400) {
    return false;
  }

  return RESPONSIBLE_AI_ERROR_CODES.has(code);
}

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

export function constructAzureImageGenerationFn(model: AiModel): ImageGenerationFn {
  const { client, deployment } = createAzureClient(model);

  return async function getAzureImageGeneration(params: Parameters<ImageGenerationFn>[0]) {
    const { prompt } = params;
    const inputImages = params.options?.inputImages ?? [];
    return Sentry.startSpan(
      {
        name: `generate_image ${model.name}`,
        op: 'gen_ai.generate_image',
        attributes: {
          'gen_ai.operation.name': 'generate_image',
          'gen_ai.system': 'azure_openai',
          'gen_ai.request.model': model.name,
          'http.request.method': 'POST',
        },
      },
      async (span) => {
        try {
          const size = params.options?.size ?? '1024x1024';
          const result =
            inputImages.length > 0
              ? await client.images.edit(
                  {
                    prompt,
                    size,
                    n: 1,
                    quality: 'medium',
                    image: await Promise.all(
                      inputImages.map((image) =>
                        toFile(image.data, image.filename, { type: image.mimeType }),
                      ),
                    ),
                  },
                  {
                    path: `/openai/deployments/${deployment}/images/edits`,
                  },
                )
              : await client.images.generate(
                  {
                    prompt,
                    size,
                    n: 1,
                    quality: 'medium',
                  },
                  {
                    path: `/openai/deployments/${deployment}/images/generations`,
                  },
                );

          if (!result.data || result.data.length === 0) {
            throw new AiGenerationError('No image data received from Azure OpenAI');
          }

          if (!result.usage) {
            throw new AiGenerationError('No usage data received from Azure OpenAI');
          }

          setUsageAttributes(span, result.usage);
          span.setAttribute('gen_ai.response.finish_reasons', ['success']);
          span.setAttribute('gen_ai.response.model', model.name);

          return {
            data: result.data
              .map((item) => item.b64_json)
              .filter((item): item is string => item !== undefined),
            output_format: result.output_format,
            usage: {
              input_text_tokens: result.usage.input_tokens_details.text_tokens,
              output_text_tokens: result.usage.output_tokens_details?.text_tokens,
              output_image_tokens: result.usage.output_tokens_details?.image_tokens ?? 0,
            },
          };
        } catch (error) {
          span.setAttribute('error', true);

          if (isResponsibleAiPolicyError(error)) {
            span.setAttribute('gen_ai.response.finish_reasons', [error.code]);
            throw new ResponsibleAIError(
              `Azure OpenAI Responsible AI Policy Violation: ${error.message}`,
            );
          }

          if (error instanceof AiGenerationError) {
            throw error;
          }

          if (error instanceof Error) {
            throw new AiGenerationError(`Azure OpenAI Error: ${error.message}`);
          }

          throw new AiGenerationError(
            'An unknown error occurred during Azure OpenAI image generation',
          );
        }
      },
    );
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
