import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyUnusableError } from '../errors';
import { generateAgenticStreamWithBilling } from './agentic-stream';
import type { AiModel, ModelSelection, StreamEvent, TokenUsage } from './types';

vi.mock('./providers', () => ({
  generateAgenticStream: vi.fn(),
}));

vi.mock('../api-keys/billing', () => ({
  billTextGenerationUsageToApiKey: vi.fn(),
}));

vi.mock('../api-keys/access', () => ({
  assertApiKeyCanUseModel: vi.fn(),
}));

vi.mock('../api-keys/model-access', () => ({
  hasAccessToModel: vi.fn(),
}));

vi.mock('../models', () => ({
  getTextModelById: vi.fn(),
}));

import { assertApiKeyCanUseModel } from '../api-keys/access';
import { billTextGenerationUsageToApiKey } from '../api-keys/billing';
import { getTextModelById } from '../models';
import { generateAgenticStream } from './providers';

const mockGenerateAgenticStream = vi.mocked(generateAgenticStream);
const mockBillTextGenerationUsageToApiKey = vi.mocked(billTextGenerationUsageToApiKey);
const mockAssertApiKeyCanUseModel = vi.mocked(assertApiKeyCanUseModel);
const mockGetTextModelById = vi.mocked(getTextModelById);

describe('generateAgenticStreamWithBilling', () => {
  const mockModel = { id: 'model-123', name: 'test-model', provider: 'ionos' } as AiModel;
  const selection: ModelSelection = { modelIds: ['model-123'], modelName: 'test-model' };
  const messages = [{ role: 'user' as const, content: 'Hello' }];
  const usage: TokenUsage = { completionTokens: 50, promptTokens: 100, totalTokens: 150 };

  async function consume(generator: AsyncGenerator<StreamEvent>) {
    const events: StreamEvent[] = [];
    for await (const event of generator) events.push(event);
    return events;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks the API key for a text model, then streams and bills', async () => {
    const finish = { type: 'finish', usage } as StreamEvent;
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockGenerateAgenticStream.mockImplementation(async function* () {
      yield finish;
    });
    mockBillTextGenerationUsageToApiKey.mockResolvedValue(75);
    const onComplete = vi.fn();

    const events = await consume(
      generateAgenticStreamWithBilling(selection, messages, 'api-key-123', onComplete),
    );

    expect(mockAssertApiKeyCanUseModel).toHaveBeenCalledWith('api-key-123', mockModel, 'text');
    expect(events).toEqual([finish]);
    expect(mockBillTextGenerationUsageToApiKey).toHaveBeenCalledWith(
      'api-key-123',
      mockModel,
      usage,
    );
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ priceInCents: 75 }));
  });

  it('does not stream or bill when the API key check fails', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockAssertApiKeyCanUseModel.mockRejectedValueOnce(
      new ApiKeyUnusableError({ apiKeyId: 'api-key-123', reason: 'Api key is expired' }),
    );

    await expect(
      consume(generateAgenticStreamWithBilling(selection, messages, 'api-key-123')),
    ).rejects.toThrow(ApiKeyUnusableError);

    expect(mockGenerateAgenticStream).not.toHaveBeenCalled();
    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });
});
