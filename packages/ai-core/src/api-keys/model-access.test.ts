import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiModel } from '../images/types';
import { hasAccessToModel } from './model-access';

// Mock the api-database functions
vi.mock('@ais-chat/api-database', () => ({
  dbHasApiKeyAccessToModel: vi.fn(),
}));

import { dbHasApiKeyAccessToModel } from '@ais-chat/api-database';

const mockDbHasApiKeyAccessToModel = vi.mocked(dbHasApiKeyAccessToModel);

describe('hasAccessToModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when API key has access to the model', async () => {
    const apiKeyId = 'test-api-key-123';
    const imageModel: AiModel = {
      id: 'model-123',
      name: 'test-model',
      provider: 'ionos',
    } as AiModel;

    mockDbHasApiKeyAccessToModel.mockResolvedValue(true as never);

    const result = await hasAccessToModel(apiKeyId, imageModel);

    expect(result).toBe(true);
    expect(mockDbHasApiKeyAccessToModel).toHaveBeenCalledWith({
      apiKeyId: 'test-api-key-123',
      modelId: 'model-123',
    });
  });

  it('should return false when API key does not have access to the model', async () => {
    const apiKeyId = 'test-api-key-456';
    const imageModel: AiModel = {
      id: 'model-789',
      name: 'restricted-model',
      provider: 'azure',
    } as AiModel;

    mockDbHasApiKeyAccessToModel.mockResolvedValue(false as never);

    const result = await hasAccessToModel(apiKeyId, imageModel);

    expect(result).toBe(false);
    expect(mockDbHasApiKeyAccessToModel).toHaveBeenCalledWith({
      apiKeyId: 'test-api-key-456',
      modelId: 'model-789',
    });
  });
});
