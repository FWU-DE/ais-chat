import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiGenerationError, ApiKeyUnusableError, InvalidModelError } from '../errors';
import { generateTextStreamWithBilling, generateTextWithBilling } from './index';
import type { AiModel, TokenUsage } from './types';

// Mock all dependencies
vi.mock('./providers', () => ({
  generateText: vi.fn(),
  generateTextStream: vi.fn(),
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
import { generateText, generateTextStream } from './providers';

const mockGenerateText = vi.mocked(generateText);
const mockGenerateTextStream = vi.mocked(generateTextStream);
const mockBillTextGenerationUsageToApiKey = vi.mocked(billTextGenerationUsageToApiKey);
const mockAssertApiKeyCanUseModel = vi.mocked(assertApiKeyCanUseModel);
const mockGetTextModelById = vi.mocked(getTextModelById);

describe('generateTextWithBilling', () => {
  const mockModel = {
    id: 'model-123',
    name: 'test-model',
    provider: 'ionos',
    priceMetadata: {
      type: 'text',
      promptTokenPrice: 100,
      completionTokenPrice: 200,
    },
  } as AiModel;

  const mockUsage: TokenUsage = {
    completionTokens: 50,
    promptTokens: 100,
    totalTokens: 150,
  };

  const mockTextResponse = {
    text: 'Generated text response',
    usage: mockUsage,
  };

  const mockMessages = [
    { role: 'system' as const, content: 'You are a helpful assistant' },
    { role: 'user' as const, content: 'Hello' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully generate text with billing', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockGenerateText.mockResolvedValue(mockTextResponse);
    mockBillTextGenerationUsageToApiKey.mockResolvedValue(50);

    const result = await generateTextWithBilling('model-123', mockMessages, 'api-key-123');

    expect(mockGetTextModelById).toHaveBeenCalledWith('model-123');
    expect(mockAssertApiKeyCanUseModel).toHaveBeenCalledWith('api-key-123', mockModel, 'text');
    expect(mockGenerateText).toHaveBeenCalledWith(mockModel, mockMessages, undefined);
    expect(mockBillTextGenerationUsageToApiKey).toHaveBeenCalledWith(
      'api-key-123',
      mockModel,
      mockUsage,
    );
    expect(result).toEqual({
      ...mockTextResponse,
      modelId: 'model-123',
      priceInCents: 50,
      // Falls back to the billing model's own provider/name since the provider response omitted them.
      provider: 'ionos',
      modelName: 'test-model',
    });
  });

  it('should not generate when the API key check fails', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockAssertApiKeyCanUseModel.mockRejectedValueOnce(
      new ApiKeyUnusableError({ apiKeyId: 'api-key-123', reason: 'Api key is expired' }),
    );

    await expect(generateTextWithBilling('model-123', mockMessages, 'api-key-123')).rejects.toThrow(
      ApiKeyUnusableError,
    );

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should wrap non-AiGenerationError errors', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockGenerateText.mockRejectedValue(new Error('Network error'));

    await expect(generateTextWithBilling('model-123', mockMessages, 'api-key-123')).rejects.toThrow(
      AiGenerationError,
    );

    await expect(generateTextWithBilling('model-123', mockMessages, 'api-key-123')).rejects.toThrow(
      'Text generation failed: Network error',
    );

    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should not wrap AiGenerationError errors', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    const originalError = new InvalidModelError('Original error');
    mockGenerateText.mockRejectedValue(originalError);

    await expect(generateTextWithBilling('model-123', mockMessages, 'api-key-123')).rejects.toThrow(
      originalError,
    );

    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should handle string errors during generation', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockGenerateText.mockRejectedValue('String error');

    await expect(generateTextWithBilling('model-123', mockMessages, 'api-key-123')).rejects.toThrow(
      'Text generation failed: String error',
    );
  });
});

describe('generateTextStreamWithBilling', () => {
  const mockModel = {
    id: 'model-123',
    name: 'test-model',
    provider: 'ionos',
    priceMetadata: {
      type: 'text',
      promptTokenPrice: 100,
      completionTokenPrice: 200,
    },
  } as AiModel;

  const mockUsage: TokenUsage = {
    completionTokens: 50,
    promptTokens: 100,
    totalTokens: 150,
  };

  const mockMessages = [
    { role: 'system' as const, content: 'You are a helpful assistant' },
    { role: 'user' as const, content: 'Hello' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully generate text stream with billing', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);

    // Create a mock that will call the callback
    mockGenerateTextStream.mockImplementation((model, messages, onComplete) => {
      return (async function* () {
        yield 'chunk1';
        yield 'chunk2';
        yield 'chunk3';

        // Simulate calling the onComplete callback
        if (onComplete) {
          await onComplete(mockUsage);
        }
      })();
    });

    mockBillTextGenerationUsageToApiKey.mockResolvedValue(75);

    const onCompleteMock = vi.fn();
    const generator = generateTextStreamWithBilling(
      'model-123',
      mockMessages,
      'api-key-123',
      onCompleteMock,
    );

    const chunks: string[] = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    expect(mockGetTextModelById).toHaveBeenCalledWith('model-123');
    expect(mockAssertApiKeyCanUseModel).toHaveBeenCalledWith('api-key-123', mockModel, 'text');
    expect(mockGenerateTextStream).toHaveBeenCalled();
    expect(chunks).toEqual(['chunk1', 'chunk2', 'chunk3']);
    expect(mockBillTextGenerationUsageToApiKey).toHaveBeenCalled();
    expect(onCompleteMock).toHaveBeenCalledWith({
      usage: mockUsage,
      priceInCents: 75,
      modelId: 'model-123',
    });
  });

  it('should not stream when the API key check fails', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockAssertApiKeyCanUseModel.mockRejectedValueOnce(
      new ApiKeyUnusableError({ apiKeyId: 'api-key-123', reason: 'Api key is expired' }),
    );

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of generateTextStreamWithBilling(
        'model-123',
        mockMessages,
        'api-key-123',
      )) {
        // Should not reach here
      }
    }).rejects.toThrow(ApiKeyUnusableError);

    expect(mockGenerateTextStream).not.toHaveBeenCalled();
    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should work without onComplete callback', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);

    mockGenerateTextStream.mockImplementation((model, messages, onComplete) => {
      return (async function* () {
        yield 'chunk1';
        yield 'chunk2';
        if (onComplete) {
          await onComplete(mockUsage);
        }
      })();
    });

    mockBillTextGenerationUsageToApiKey.mockResolvedValue(75);

    const generator = generateTextStreamWithBilling('model-123', mockMessages, 'api-key-123');

    const chunks: string[] = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['chunk1', 'chunk2']);
    expect(mockBillTextGenerationUsageToApiKey).toHaveBeenCalled();
  });

  it('should wrap non-AiGenerationError errors', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);

    // eslint-disable-next-line require-yield -- Generator intentionally throws error without yielding to test error handling
    const mockStreamGenerator = (async function* (): AsyncGenerator<string, TokenUsage> {
      throw new Error('Network error');
    })();

    mockGenerateTextStream.mockReturnValue(mockStreamGenerator);

    const generator = generateTextStreamWithBilling('model-123', mockMessages, 'api-key-123');

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of generator) {
        // Should not reach here
      }
    }).rejects.toThrow('Text generation failed: Network error');

    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should not wrap AiGenerationError errors', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);

    const originalError = new InvalidModelError('Original error');
    // eslint-disable-next-line require-yield -- Generator intentionally throws error without yielding to test error handling
    const mockStreamGenerator = (async function* (): AsyncGenerator<string, TokenUsage> {
      throw originalError;
    })();

    mockGenerateTextStream.mockReturnValue(mockStreamGenerator);

    const generator = generateTextStreamWithBilling('model-123', mockMessages, 'api-key-123');

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of generator) {
        // Should not reach here
      }
    }).rejects.toThrow(originalError);

    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });
});
