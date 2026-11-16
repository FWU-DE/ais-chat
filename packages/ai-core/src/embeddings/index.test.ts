import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiGenerationError, ApiKeyUnusableError, InvalidModelError } from '../errors';
import { generateEmbeddingsWithBilling } from './index';
import type { AiModel } from './types';

// Mock all dependencies
vi.mock('./providers', () => ({
  generateEmbeddings: vi.fn(),
}));

vi.mock('../api-keys/access', () => ({
  assertApiKeyCanUseModel: vi.fn(),
}));

vi.mock('../models', () => ({
  getEmbeddingModelById: vi.fn(),
}));

import { assertApiKeyCanUseModel } from '../api-keys/access';
import { getEmbeddingModelById } from '../models';
import { generateEmbeddings } from './providers';

const mockGenerateEmbeddings = vi.mocked(generateEmbeddings);
const mockAssertApiKeyCanUseModel = vi.mocked(assertApiKeyCanUseModel);
const mockGetEmbeddingModelById = vi.mocked(getEmbeddingModelById);

describe('generateEmbeddingsWithBilling', () => {
  const mockModel = {
    id: 'model-123',
    name: 'test-embedding-model',
    provider: 'ionos',
    priceMetadata: {
      type: 'embedding',
      promptTokenPrice: 10,
    },
  } as AiModel;

  const mockEmbeddingResponse = {
    embeddings: [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ],
  };

  const mockTexts = ['Hello world', 'Test embedding'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully generate embeddings with access control', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockGenerateEmbeddings.mockResolvedValue(mockEmbeddingResponse);

    const result = await generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123');

    expect(mockGetEmbeddingModelById).toHaveBeenCalledWith('model-123');
    expect(mockAssertApiKeyCanUseModel).toHaveBeenCalledWith('api-key-123', mockModel, 'embedding');
    expect(mockGenerateEmbeddings).toHaveBeenCalledWith(mockModel, mockTexts);
    expect(result).toEqual(mockEmbeddingResponse);
  });

  it('should not generate when the API key check fails', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockAssertApiKeyCanUseModel.mockRejectedValueOnce(
      new ApiKeyUnusableError({ apiKeyId: 'api-key-123', reason: 'Api key is expired' }),
    );

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow(ApiKeyUnusableError);

    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
  });

  it('should wrap non-AiGenerationError errors', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockGenerateEmbeddings.mockRejectedValue(new Error('Network error'));

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow(AiGenerationError);

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow('Embedding generation failed: Network error');
  });

  it('should not wrap AiGenerationError errors', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    const originalError = new InvalidModelError('Original error');
    mockGenerateEmbeddings.mockRejectedValue(originalError);

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow(originalError);
  });

  it('should handle string errors during generation', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockGenerateEmbeddings.mockRejectedValue('String error');

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow('Embedding generation failed: String error');
  });

  it('should handle empty text array', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockGenerateEmbeddings.mockResolvedValue({ embeddings: [] });

    const result = await generateEmbeddingsWithBilling('model-123', [], 'api-key-123');

    expect(mockGenerateEmbeddings).toHaveBeenCalledWith(mockModel, []);
    expect(result).toEqual({ embeddings: [] });
  });

  it('should handle single text input', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    const singleEmbedding = { embeddings: [[0.1, 0.2, 0.3]] };
    mockGenerateEmbeddings.mockResolvedValue(singleEmbedding);

    const result = await generateEmbeddingsWithBilling('model-123', ['Single text'], 'api-key-123');

    expect(mockGenerateEmbeddings).toHaveBeenCalledWith(mockModel, ['Single text']);
    expect(result).toEqual(singleEmbedding);
  });
});
