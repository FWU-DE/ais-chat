import { instrumentOpenAiClient } from '@sentry/core';
import OpenAI from 'openai';
import type { AiModel, SafetyCheckFn, SafetyResult } from '../types';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import { env } from '../../env';

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
    modelName: model.name,
  };
}

export function constructBifrostSafetyCheckFn(model: AiModel): SafetyCheckFn {
  const { client, modelName } = createBifrostClient(model);

  return async function checkBifrostSafety({ text }): Promise<SafetyResult> {
    try {
      const response = await client.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: text }],
        max_tokens: 100,
      });
      const result = response.choices[0]?.message.content;
      if (!result) {
        throw new Error('Bifrost safety model returned no result');
      }

      return { result };
    } catch (error) {
      throw new AiGenerationError(
        `Bifrost Safety request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
