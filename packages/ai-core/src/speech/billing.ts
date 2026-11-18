import { assertApiKeyCanUseModel } from '../api-keys/access';
import { billSpeechUsageToApiKey } from '../api-keys/billing';
import {
  InvalidSpeechVoiceError,
  normalizeAiGenerationError,
  ProviderConfigurationError,
} from '../errors';
import { getSpeechModelById, getSpeechModelByName } from '../models';
import { streamSpeechForModel } from './generate-stream';
import type { AiModel, SpeechStreamResult, SpeechUsage } from './types';

export type SpeechBillingOptions = {
  abortSignal?: AbortSignal;
  onComplete?: (result: {
    usage: SpeechUsage;
    priceInCents: number;
    modelId: string;
  }) => void | Promise<void>;
};

function validateVoice(model: AiModel, voice: string): void {
  const voices = (model.modelConfig?.voices ?? []).map((configuredVoice) => configuredVoice.name);
  if (voices.length === 0) {
    throw new ProviderConfigurationError(`No voices configured for speech model ${model.name}`);
  }
  if (!voices.includes(voice)) {
    throw new InvalidSpeechVoiceError(voice, voices);
  }
}

function rethrow(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }
  if (typeof error === 'object') {
    throw new Error(JSON.stringify(error));
  }
  throw new Error(JSON.stringify(error));
}

async function generateSpeechStreamForModel(
  model: AiModel,
  text: string,
  voice: string,
  apiKeyId: string,
  options?: SpeechBillingOptions,
) {
  validateVoice(model, voice);
  await assertApiKeyCanUseModel(apiKeyId, model, 'speech');

  try {
    const stream = await streamSpeechForModel(model, {
      text,
      voice,
      abortSignal: options?.abortSignal,
    });
    return withBilling(stream, model, apiKeyId, options?.onComplete);
  } catch (error) {
    throw normalizeAiGenerationError(error, 'Speech generation failed');
  }
}

function withBilling(
  stream: SpeechStreamResult,
  model: AiModel,
  apiKeyId: string,
  onComplete?: SpeechBillingOptions['onComplete'],
) {
  let finalized = false;
  let resolvePrice!: (price: number) => void;
  let rejectPrice!: (error: unknown) => void;
  const priceInCents = new Promise<number>((resolve, reject) => {
    resolvePrice = resolve;
    rejectPrice = reject;
  });
  priceInCents.catch(() => undefined);

  const finalize = async (): Promise<unknown> => {
    if (finalized) {
      return;
    }
    finalized = true;
    try {
      const usage = await stream.usage;
      const price = await billSpeechUsageToApiKey(apiKeyId, model, usage);
      resolvePrice(price);
      await onComplete?.({ usage, priceInCents: price, modelId: model.id });
    } catch (error) {
      rejectPrice(error);
      return error;
    }
  };

  async function* chunks(): AsyncGenerator<Buffer, void, unknown> {
    let streamFailed = false;
    try {
      yield* stream.chunks;
    } catch (error) {
      streamFailed = true;
      throw normalizeAiGenerationError(error, 'Speech generation failed');
    } finally {
      const billingError = await finalize();
      if (!streamFailed && billingError !== undefined) {
        rethrow(billingError);
      }
    }
  }

  return {
    chunks: chunks(),
    mimeType: stream.mimeType,
    usage: stream.usage,
    priceInCents,
    model: { id: model.id, name: model.name, provider: model.provider },
  };
}

/** Generates speech with access control and usage billing. */
export async function generateSpeechStreamWithBilling(
  modelId: string,
  text: string,
  voice: string,
  apiKeyId: string,
  options?: SpeechBillingOptions,
) {
  const model = await getSpeechModelById(modelId);
  return generateSpeechStreamForModel(model, text, voice, apiKeyId, options);
}

/** Generates speech with access control and usage billing using a model name. */
export async function generateSpeechStreamByNameWithBilling(
  modelName: string,
  text: string,
  voice: string,
  apiKeyId: string,
  options?: SpeechBillingOptions,
) {
  const model = await getSpeechModelByName(modelName, apiKeyId);
  return generateSpeechStreamForModel(model, text, voice, apiKeyId, options);
}
