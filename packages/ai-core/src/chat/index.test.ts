import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateTextWithBilling, generateTextStreamWithBilling } from './index';
import { AiGenerationError, InvalidModelError } from '../errors';
import type { AiModel, TokenUsage } from './types';

// Mock all dependencies
vi.mock('./providers', () => ({
  generateText: vi.fn(),
  generateTextStream: vi.fn(),
}));

vi.mock('../api-keys/billing', () => ({
  billTextGenerationUsageToApiKey: vi.fn(),
  isApiKeyOverQuota: vi.fn(),
}));

vi.mock('../api-keys/model-access', () => ({
  hasAccessToModel: vi.fn(),
}));

vi.mock('../models', () => ({
  getTextModelById: vi.fn(),
}));

import { generateText, generateTextStream } from './providers';
import { billTextGenerationUsageToApiKey, isApiKeyOverQuota } from '../api-keys/billing';
import { hasAccessToModel } from '../api-keys/model-access';
import { getTextModelById } from '../models';

const mockGenerateText = vi.mocked(generateText);
const mockGenerateTextStream = vi.mocked(generateTextStream);
const mockBillTextGenerationUsageToApiKey = vi.mocked(billTextGenerationUsageToApiKey);
const mockIsApiKeyOverQuota = vi.mocked(isApiKeyOverQuota);
const mockHasAccessToModel = vi.mocked(hasAccessToModel);
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
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateText.mockResolvedValue(mockTextResponse);
    mockBillTextGenerationUsageToApiKey.mockResolvedValue(50);

    const result = await generateTextWithBilling('model-123', mockMessages, 'api-key-123');

    expect(mockGetTextModelById).toHaveBeenCalledWith('model-123');
    expect(mockHasAccessToModel).toHaveBeenCalledWith('api-key-123', mockModel);
    expect(mockIsApiKeyOverQuota).toHaveBeenCalledWith('api-key-123');
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

  it('should throw InvalidModelError when API key does not have access', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(false);
    mockIsApiKeyOverQuota.mockResolvedValue(false);

    await expect(generateTextWithBilling('model-123', mockMessages, 'api-key-123')).rejects.toThrow(
      InvalidModelError,
    );

    await expect(generateTextWithBilling('model-123', mockMessages, 'api-key-123')).rejects.toThrow(
      'API key does not have access to the text model: test-model',
    );

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should throw AiGenerationError when API key is over quota', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(true);

    await expect(generateTextWithBilling('model-123', mockMessages, 'api-key-123')).rejects.toThrow(
      AiGenerationError,
    );

    await expect(generateTextWithBilling('model-123', mockMessages, 'api-key-123')).rejects.toThrow(
      'API key has exceeded its monthly quota',
    );

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should run access check and quota check in parallel', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateText.mockResolvedValue(mockTextResponse);
    mockBillTextGenerationUsageToApiKey.mockResolvedValue(50);

    await generateTextWithBilling('model-123', mockMessages, 'api-key-123');

    // Both should be called
    expect(mockHasAccessToModel).toHaveBeenCalledTimes(1);
    expect(mockIsApiKeyOverQuota).toHaveBeenCalledTimes(1);
  });

  it('should wrap non-AiGenerationError errors', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
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
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    const originalError = new InvalidModelError('Original error');
    mockGenerateText.mockRejectedValue(originalError);

    await expect(generateTextWithBilling('model-123', mockMessages, 'api-key-123')).rejects.toThrow(
      originalError,
    );

    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should handle string errors during generation', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
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
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);

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
    expect(mockHasAccessToModel).toHaveBeenCalledWith('api-key-123', mockModel);
    expect(mockIsApiKeyOverQuota).toHaveBeenCalledWith('api-key-123');
    expect(mockGenerateTextStream).toHaveBeenCalled();
    expect(chunks).toEqual(['chunk1', 'chunk2', 'chunk3']);
    expect(mockBillTextGenerationUsageToApiKey).toHaveBeenCalled();
    expect(onCompleteMock).toHaveBeenCalledWith({
      usage: mockUsage,
      priceInCents: 75,
      modelId: 'model-123',
    });
  });

  it('should throw InvalidModelError when API key does not have access', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(false);
    mockIsApiKeyOverQuota.mockResolvedValue(false);

    const generator = generateTextStreamWithBilling('model-123', mockMessages, 'api-key-123');

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of generator) {
        // Should not reach here
      }
    }).rejects.toThrow(InvalidModelError);

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of generateTextStreamWithBilling(
        'model-123',
        mockMessages,
        'api-key-123',
      )) {
        // Should not reach here
      }
    }).rejects.toThrow('API key does not have access to the text model: test-model');

    expect(mockGenerateTextStream).not.toHaveBeenCalled();
    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should throw AiGenerationError when API key is over quota', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(true);

    const generator = generateTextStreamWithBilling('model-123', mockMessages, 'api-key-123');

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of generator) {
        // Should not reach here
      }
    }).rejects.toThrow(AiGenerationError);

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of generateTextStreamWithBilling(
        'model-123',
        mockMessages,
        'api-key-123',
      )) {
        // Should not reach here
      }
    }).rejects.toThrow('API key has exceeded its monthly quota');

    expect(mockGenerateTextStream).not.toHaveBeenCalled();
    expect(mockBillTextGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should run access check and quota check in parallel', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);

    mockGenerateTextStream.mockImplementation((model, messages, onComplete) => {
      return (async function* () {
        yield 'chunk1';
        if (onComplete) {
          await onComplete(mockUsage);
        }
      })();
    });

    mockBillTextGenerationUsageToApiKey.mockResolvedValue(75);

    const generator = generateTextStreamWithBilling('model-123', mockMessages, 'api-key-123');

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of generator) {
      // Consume stream
    }

    // Both should be called
    expect(mockHasAccessToModel).toHaveBeenCalledTimes(1);
    expect(mockIsApiKeyOverQuota).toHaveBeenCalledTimes(1);
  });

  it('should work without onComplete callback', async () => {
    mockGetTextModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);

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
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);

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
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);

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
