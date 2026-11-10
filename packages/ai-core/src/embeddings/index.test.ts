import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiGenerationError, InvalidModelError } from '../errors';
import { generateEmbeddingsWithBilling } from './index';
import type { AiModel } from './types';

// Mock all dependencies
vi.mock('./providers', () => ({
  generateEmbeddings: vi.fn(),
}));

vi.mock('../api-keys/billing', () => ({
  isApiKeyOverQuota: vi.fn(),
}));

vi.mock('../api-keys/model-access', () => ({
  hasAccessToModel: vi.fn(),
}));

vi.mock('../models', () => ({
  getEmbeddingModelById: vi.fn(),
}));

import { isApiKeyOverQuota } from '../api-keys/billing';
import { hasAccessToModel } from '../api-keys/model-access';
import { getEmbeddingModelById } from '../models';
import { generateEmbeddings } from './providers';

const mockGenerateEmbeddings = vi.mocked(generateEmbeddings);
const mockIsApiKeyOverQuota = vi.mocked(isApiKeyOverQuota);
const mockHasAccessToModel = vi.mocked(hasAccessToModel);
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
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateEmbeddings.mockResolvedValue(mockEmbeddingResponse);

    const result = await generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123');

    expect(mockGetEmbeddingModelById).toHaveBeenCalledWith('model-123');
    expect(mockHasAccessToModel).toHaveBeenCalledWith('api-key-123', mockModel);
    expect(mockIsApiKeyOverQuota).toHaveBeenCalledWith('api-key-123');
    expect(mockGenerateEmbeddings).toHaveBeenCalledWith(mockModel, mockTexts);
    expect(result).toEqual(mockEmbeddingResponse);
  });

  it('should throw InvalidModelError when API key does not have access', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(false);
    mockIsApiKeyOverQuota.mockResolvedValue(false);

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow(InvalidModelError);

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow('API key does not have access to the embedding model: test-embedding-model');

    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
  });

  it('should throw AiGenerationError when API key is over quota', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(true);

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow(AiGenerationError);

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow('API key has exceeded its monthly quota');

    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
  });

  it('should run access check and quota check in parallel', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateEmbeddings.mockResolvedValue(mockEmbeddingResponse);

    await generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123');

    // Both should be called
    expect(mockHasAccessToModel).toHaveBeenCalledTimes(1);
    expect(mockIsApiKeyOverQuota).toHaveBeenCalledTimes(1);
  });

  it('should wrap non-AiGenerationError errors', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
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
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    const originalError = new InvalidModelError('Original error');
    mockGenerateEmbeddings.mockRejectedValue(originalError);

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow(originalError);
  });

  it('should handle string errors during generation', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateEmbeddings.mockRejectedValue('String error');

    await expect(
      generateEmbeddingsWithBilling('model-123', mockTexts, 'api-key-123'),
    ).rejects.toThrow('Embedding generation failed: String error');
  });

  it('should handle empty text array', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateEmbeddings.mockResolvedValue({ embeddings: [] });

    const result = await generateEmbeddingsWithBilling('model-123', [], 'api-key-123');

    expect(mockGenerateEmbeddings).toHaveBeenCalledWith(mockModel, []);
    expect(result).toEqual({ embeddings: [] });
  });

  it('should handle single text input', async () => {
    mockGetEmbeddingModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    const singleEmbedding = { embeddings: [[0.1, 0.2, 0.3]] };
    mockGenerateEmbeddings.mockResolvedValue(singleEmbedding);

    const result = await generateEmbeddingsWithBilling('model-123', ['Single text'], 'api-key-123');

    expect(mockGenerateEmbeddings).toHaveBeenCalledWith(mockModel, ['Single text']);
    expect(result).toEqual(singleEmbedding);
  });
});
