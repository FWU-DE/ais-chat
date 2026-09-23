import { describe, it, expect, vi, beforeEach } from 'vitest';
import { billImageGenerationUsageToApiKey, isApiKeyOverQuota } from './billing';
import type { AiModel } from '../images/types';

// Mock the api-database functions
vi.mock('@ais-chat/api-database', () => ({
  dbCreateImageGenerationUsage: vi.fn(),
  dbGetApiKeyLimit: vi.fn(),
  dbGetCompletionUsageCostsSinceStartOfCurrentMonth: vi.fn(),
  dbGetImageGenerationUsageCostsSinceStartOfCurrentMonth: vi.fn(),
}));

import {
  dbCreateImageGenerationUsage,
  dbGetApiKeyLimit,
  dbGetCompletionUsageCostsSinceStartOfCurrentMonth,
  dbGetImageGenerationUsageCostsSinceStartOfCurrentMonth,
} from '@ais-chat/api-database';

const mockDbCreateImageGenerationUsage = vi.mocked(dbCreateImageGenerationUsage);
const mockDbGetApiKeyLimit = vi.mocked(dbGetApiKeyLimit);
const mockDbGetCompletionUsageCostsSinceStartOfCurrentMonth = vi.mocked(
  dbGetCompletionUsageCostsSinceStartOfCurrentMonth,
);
const mockDbGetImageGenerationUsageCostsSinceStartOfCurrentMonth = vi.mocked(
  dbGetImageGenerationUsageCostsSinceStartOfCurrentMonth,
);

describe('billImageGenerationUsageToApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should bill image generation usage successfully', async () => {
    const apiKeyId = 'test-api-key-123';
    const imageModel: AiModel = {
      id: 'model-123',
      name: 'test-model',
      provider: 'ionos',
      priceMetadata: {
        type: 'image',
        pricePerImageInCent: 50,
      },
    } as AiModel;

    mockDbCreateImageGenerationUsage.mockResolvedValue(undefined as never);

    const result = await billImageGenerationUsageToApiKey(apiKeyId, imageModel);

    expect(result).toBe(50);
    expect(mockDbCreateImageGenerationUsage).toHaveBeenCalledWith({
      apiKeyId: 'test-api-key-123',
      modelId: 'model-123',
      costsInCent: 50,
    });
  });

  it('should bill token-based image generation usage successfully', async () => {
    const apiKeyId = 'test-api-key-123';
    const imageModel: AiModel = {
      id: 'model-789',
      name: 'token-image-model',
      displayName: 'Token Image Model',
      provider: 'azure',
      priceMetadata: {
        type: 'image',
        inputTextTokenPrice: 1,
        inputImageTokenPrice: 4,
        outputTextTokenPrice: 2,
        outputImageTokenPrice: 3,
      },
    } as AiModel;

    const usage = {
      input_text_tokens: 1_000_000,
      input_image_tokens: 1_000_000,
      output_text_tokens: 1_000_000,
      output_image_tokens: 1_000_000,
    };

    mockDbCreateImageGenerationUsage.mockResolvedValue(undefined as never);

    const result = await billImageGenerationUsageToApiKey(apiKeyId, imageModel, usage);

    expect(result).toBe(10);
    expect(mockDbCreateImageGenerationUsage).toHaveBeenCalledWith({
      apiKeyId: 'test-api-key-123',
      modelId: 'model-789',
      costsInCent: 10,
    });
  });

  it('should throw an error if model is not an image model', async () => {
    const apiKeyId = 'test-api-key-123';
    const nonImageModel: AiModel = {
      id: 'model-456',
      name: 'text-model',
      displayName: 'Text Model',
      provider: 'azure',
      priceMetadata: {
        type: 'text',
      },
    } as AiModel;

    await expect(billImageGenerationUsageToApiKey(apiKeyId, nonImageModel)).rejects.toThrow(
      'Model Text Model is not an image model',
    );

    expect(mockDbCreateImageGenerationUsage).not.toHaveBeenCalled();
  });
});

describe('isApiKeyOverQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when usage is below limit', async () => {
    const apiKeyId = 'test-api-key-123';

    mockDbGetApiKeyLimit.mockResolvedValue({ limitInCent: 10000 } as never);
    mockDbGetCompletionUsageCostsSinceStartOfCurrentMonth.mockResolvedValue(3000 as never);
    mockDbGetImageGenerationUsageCostsSinceStartOfCurrentMonth.mockResolvedValue(2000 as never);

    const result = await isApiKeyOverQuota(apiKeyId);

    expect(result).toBe(false);
    expect(mockDbGetApiKeyLimit).toHaveBeenCalledWith(apiKeyId);
    expect(mockDbGetCompletionUsageCostsSinceStartOfCurrentMonth).toHaveBeenCalledWith({
      apiKeyId,
    });
    expect(mockDbGetImageGenerationUsageCostsSinceStartOfCurrentMonth).toHaveBeenCalledWith({
      apiKeyId,
    });
  });

  it('should return true when usage exceeds limit', async () => {
    const apiKeyId = 'test-api-key-123';

    mockDbGetApiKeyLimit.mockResolvedValue({ limitInCent: 5000 } as never);
    mockDbGetCompletionUsageCostsSinceStartOfCurrentMonth.mockResolvedValue(4000 as never);
    mockDbGetImageGenerationUsageCostsSinceStartOfCurrentMonth.mockResolvedValue(2000 as never);

    const result = await isApiKeyOverQuota(apiKeyId);

    expect(result).toBe(true);
  });

  it('should return false when usage exactly equals limit', async () => {
    const apiKeyId = 'test-api-key-123';

    mockDbGetApiKeyLimit.mockResolvedValue({ limitInCent: 5000 } as never);
    mockDbGetCompletionUsageCostsSinceStartOfCurrentMonth.mockResolvedValue(3000 as never);
    mockDbGetImageGenerationUsageCostsSinceStartOfCurrentMonth.mockResolvedValue(2000 as never);

    const result = await isApiKeyOverQuota(apiKeyId);

    expect(result).toBe(false);
  });

  it('should throw an error if API key is not found', async () => {
    const apiKeyId = 'non-existent-key';

    mockDbGetApiKeyLimit.mockResolvedValue(null as never);

    await expect(isApiKeyOverQuota(apiKeyId)).rejects.toThrow(
      'API key not found: non-existent-key',
    );
  });
});
