import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AiGenerationError,
  ApiKeyUnusableError,
  InvalidSpeechVoiceError,
  ProviderConfigurationError,
} from '../errors';
import { generateSpeechStreamByNameWithBilling, generateSpeechStreamWithBilling } from './billing';
import type { AiModel, SpeechStreamResult } from './types';

vi.mock('../models', () => ({
  getSpeechModelById: vi.fn(),
  getSpeechModelByName: vi.fn(),
}));

vi.mock('../api-keys/access', () => ({
  assertApiKeyCanUseModel: vi.fn(),
}));

vi.mock('../api-keys/billing', () => ({
  billSpeechUsageToApiKey: vi.fn(),
}));

vi.mock('./generate-stream', () => ({
  streamSpeechForModel: vi.fn(),
}));

import { assertApiKeyCanUseModel } from '../api-keys/access';
import { billSpeechUsageToApiKey } from '../api-keys/billing';
import { getSpeechModelById, getSpeechModelByName } from '../models';
import { streamSpeechForModel } from './generate-stream';

const mockAssertApiKeyCanUseModel = vi.mocked(assertApiKeyCanUseModel);
const mockBillSpeechUsageToApiKey = vi.mocked(billSpeechUsageToApiKey);
const mockGetSpeechModelById = vi.mocked(getSpeechModelById);
const mockGetSpeechModelByName = vi.mocked(getSpeechModelByName);
const mockStreamSpeechForModel = vi.mocked(streamSpeechForModel);

const model = {
  id: 'speech-model',
  name: 'speech-model',
  provider: 'provider',
  modelConfig: { voices: [{ name: 'alloy', displayName: 'Alloy' }] },
  priceMetadata: { type: 'speech', priceInCentPer1MillionCharacters: 100 },
  safetyFilterEnabled: true,
} as AiModel;
const usage = { characters: 5 };

async function* chunksOf(...chunks: Buffer[]) {
  yield* chunks;
}

function makeStream(
  chunks: AsyncGenerator<Buffer, void, unknown> = chunksOf(Buffer.from('audio')),
): SpeechStreamResult {
  return {
    chunks,
    mimeType: 'audio/mpeg',
    usage: Promise.resolve(usage),
  };
}

describe('generateSpeechStreamWithBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSpeechModelById.mockResolvedValue(model);
    mockAssertApiKeyCanUseModel.mockResolvedValue(undefined);
    mockBillSpeechUsageToApiKey.mockResolvedValue(10);
    mockStreamSpeechForModel.mockResolvedValue(makeStream());
  });

  it('streams successfully, bills usage, and calls onComplete', async () => {
    const onComplete = vi.fn();
    const result = await generateSpeechStreamWithBilling(
      'speech-model',
      'hello',
      'alloy',
      'api-key',
      { onComplete },
    );

    await expect(result.chunks.next()).resolves.toEqual({
      done: false,
      value: Buffer.from('audio'),
    });
    await result.chunks.return();
    expect(mockBillSpeechUsageToApiKey).toHaveBeenCalledOnce();
    expect(mockBillSpeechUsageToApiKey).toHaveBeenCalledWith('api-key', model, usage);
    expect(onComplete).toHaveBeenCalledWith({ usage, priceInCents: 10, modelId: model.id });
  });

  it('does not stream when API-key access fails', async () => {
    mockAssertApiKeyCanUseModel.mockRejectedValue(
      new ApiKeyUnusableError({ apiKeyId: 'api-key', reason: 'expired' }),
    );

    await expect(
      generateSpeechStreamWithBilling('speech-model', 'hello', 'alloy', 'api-key'),
    ).rejects.toThrow(ApiKeyUnusableError);
    expect(mockStreamSpeechForModel).not.toHaveBeenCalled();
  });

  it('rejects unknown voices before access checks', async () => {
    await expect(
      generateSpeechStreamWithBilling('speech-model', 'hello', 'nova', 'api-key'),
    ).rejects.toBeInstanceOf(InvalidSpeechVoiceError);
    expect(mockAssertApiKeyCanUseModel).not.toHaveBeenCalled();
    expect(mockStreamSpeechForModel).not.toHaveBeenCalled();
  });

  it('rejects models without configured voices', async () => {
    mockGetSpeechModelById.mockResolvedValue({ ...model, modelConfig: null });

    await expect(
      generateSpeechStreamWithBilling('speech-model', 'hello', 'alloy', 'api-key'),
    ).rejects.toBeInstanceOf(ProviderConfigurationError);
    expect(mockAssertApiKeyCanUseModel).not.toHaveBeenCalled();
  });

  it('bills exactly once when the client returns early', async () => {
    mockStreamSpeechForModel.mockResolvedValue(
      makeStream(chunksOf(Buffer.from('first'), Buffer.from('second'))),
    );
    const result = await generateSpeechStreamWithBilling(
      'speech-model',
      'hello',
      'alloy',
      'api-key',
    );

    await result.chunks.next();
    await result.chunks.return();
    expect(mockBillSpeechUsageToApiKey).toHaveBeenCalledOnce();
  });

  it('bills after a mid-stream error and normalizes the stream error', async () => {
    async function* failingChunks() {
      yield Buffer.from('first');
      throw new Error('provider stream failed');
    }
    mockStreamSpeechForModel.mockResolvedValue(makeStream(failingChunks()));
    const result = await generateSpeechStreamWithBilling(
      'speech-model',
      'hello',
      'alloy',
      'api-key',
    );

    await result.chunks.next();
    await expect(result.chunks.next()).rejects.toThrow('Speech generation failed');
    expect(mockBillSpeechUsageToApiKey).toHaveBeenCalledOnce();
  });

  it('rejects iteration when billing fails', async () => {
    const billingError = new Error('billing unavailable');
    mockBillSpeechUsageToApiKey.mockRejectedValue(billingError);
    const result = await generateSpeechStreamWithBilling(
      'speech-model',
      'hello',
      'alloy',
      'api-key',
    );

    await expect(result.chunks.next()).resolves.toMatchObject({ done: false });
    await expect(result.chunks.return()).rejects.toBe(billingError);
  });

  it('wraps non-AI errors from the provider but preserves AI errors', async () => {
    mockStreamSpeechForModel.mockRejectedValueOnce(new Error('provider failed'));
    await expect(
      generateSpeechStreamWithBilling('speech-model', 'hello', 'alloy', 'api-key'),
    ).rejects.toThrow('Speech generation failed: provider failed');

    const generationError = new AiGenerationError('already normalized');
    mockStreamSpeechForModel.mockRejectedValueOnce(generationError);
    await expect(
      generateSpeechStreamWithBilling('speech-model', 'hello', 'alloy', 'api-key'),
    ).rejects.toBe(generationError);
  });

  it('looks up the model by name in the name-based variant', async () => {
    mockGetSpeechModelByName.mockResolvedValue(model);

    const result = await generateSpeechStreamByNameWithBilling(
      'speech-name',
      'hello',
      'alloy',
      'api-key',
    );

    expect(mockGetSpeechModelByName).toHaveBeenCalledWith('speech-name', 'api-key');
    expect(mockGetSpeechModelById).not.toHaveBeenCalled();
    expect(result.model).toEqual({ id: model.id, name: model.name, provider: model.provider });
  });
});
