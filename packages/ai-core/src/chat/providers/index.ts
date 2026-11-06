import { ProviderConfigurationError } from '../../errors';
import type {
  AgenticStreamFn,
  AiModel,
  GenerationOptions,
  StreamEvent,
  TextGenerationFn,
  TextStreamFn,
} from '../types';
import {
  constructAzureResponsesAgenticStreamFn,
  constructAzureResponsesGenerationFn,
  constructAzureResponsesStreamFn,
} from './azure';
import {
  constructBifrostAgenticStreamFn,
  constructBifrostTextGenerationFn,
  constructBifrostTextStreamFn,
} from './bifrost';
import {
  constructGoogleAgenticStreamFn,
  constructGoogleTextGenerationFn,
  constructGoogleTextStreamFn,
} from './google';
import {
  constructIonosAgenticStreamFn,
  constructIonosTextGenerationFn,
  constructIonosTextStreamFn,
} from './ionos';
import {
  constructOpenAIAgenticStreamFn,
  constructOpenAITextGenerationFn,
  constructOpenAITextStreamFn,
} from './openai';

function getTextGenerationFnByModel({ model }: { model: AiModel }): TextGenerationFn | undefined {
  if (model.provider === 'azure') {
    return constructAzureResponsesGenerationFn(model);
  }
  if (model.provider === 'ionos') {
    return constructIonosTextGenerationFn(model);
  }
  if (model.provider === 'google') {
    return constructGoogleTextGenerationFn(model);
  }
  if (model.provider === 'openai') {
    return constructOpenAITextGenerationFn(model);
  }
  if (model.provider === 'bifrost') {
    return constructBifrostTextGenerationFn(model);
  }

  return undefined;
}

function getTextStreamFnByModel({ model }: { model: AiModel }): TextStreamFn | undefined {
  if (model.provider === 'azure') {
    return constructAzureResponsesStreamFn(model);
  }
  if (model.provider === 'ionos') {
    return constructIonosTextStreamFn(model);
  }
  if (model.provider === 'google') {
    return constructGoogleTextStreamFn(model);
  }
  if (model.provider === 'openai') {
    return constructOpenAITextStreamFn(model);
  }
  if (model.provider === 'bifrost') {
    return constructBifrostTextStreamFn(model);
  }

  return undefined;
}

function getAgenticStreamFnByModel({ model }: { model: AiModel }): AgenticStreamFn | undefined {
  if (model.provider === 'azure') {
    return constructAzureResponsesAgenticStreamFn(model);
  }
  if (model.provider === 'ionos') {
    return constructIonosAgenticStreamFn(model);
  }
  if (model.provider === 'openai') {
    return constructOpenAIAgenticStreamFn(model);
  }
  if (model.provider === 'google') {
    return constructGoogleAgenticStreamFn(model);
  }
  if (model.provider === 'bifrost') {
    return constructBifrostAgenticStreamFn(model);
  }
  return undefined; // HINT: Add support for other providers here
}

export async function generateText(
  model: AiModel,
  messages: Parameters<TextGenerationFn>[0]['messages'],
  options?: GenerationOptions,
) {
  const generationFn = getTextGenerationFnByModel({ model });
  if (!generationFn) {
    throw new ProviderConfigurationError(
      `No text generation function found for provider: ${model.provider}`,
    );
  }
  return generationFn({ messages, model: model.name, ...options });
}

export function generateTextStream(
  model: AiModel,
  messages: Parameters<TextStreamFn>[0]['messages'],
  onComplete?: Parameters<TextStreamFn>[1],
  options?: GenerationOptions,
): AsyncGenerator<string> {
  const streamFn = getTextStreamFnByModel({ model });
  if (!streamFn) {
    throw new ProviderConfigurationError(
      `No text stream function found for provider: ${model.provider}`,
    );
  }
  return streamFn({ messages, model: model.name, ...options }, onComplete);
}

export function generateAgenticStream(
  model: AiModel,
  messages: Parameters<AgenticStreamFn>[0]['messages'],
  options?: GenerationOptions,
): AsyncGenerator<StreamEvent> {
  const streamFn = getAgenticStreamFnByModel({ model });
  if (!streamFn) {
    throw new ProviderConfigurationError(
      `No agentic stream function found for provider: ${model.provider}`,
    );
  }
  return streamFn({ messages, model: model.name, ...options });
}
