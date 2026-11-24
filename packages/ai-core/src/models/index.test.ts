import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getImageModelById, getSpeechModelByName } from './index';

// Mock the api-database functions
vi.mock('@ais-chat/api-database', () => ({
  dbGetModelById: vi.fn(),
  dbGetModelByNameAndApiKeyId: vi.fn(),
  dbGetDirectModelConfiguration: vi.fn(),
}));

import { dbGetModelById, dbGetModelByNameAndApiKeyId } from '@ais-chat/api-database';

const mockDbGetModelById = vi.mocked(dbGetModelById);
const mockDbGetModelByNameAndApiKeyId = vi.mocked(dbGetModelByNameAndApiKeyId);

describe('getImageModelById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return model when found', async () => {
    const mockModel = {
      id: 'model-123',
      name: 'test-model',
      provider: 'ionos',
      priceMetadata: {
        type: 'image',
        pricePerImageInCent: 50,
      },
    };

    mockDbGetModelById.mockResolvedValue(mockModel as never);

    const result = await getImageModelById('model-123');

    expect(result).toEqual(mockModel);
    expect(mockDbGetModelById).toHaveBeenCalledWith('model-123');
  });

  it('should throw error when model is not found', async () => {
    mockDbGetModelById.mockResolvedValue(null as never);

    await expect(getImageModelById('non-existent-model')).rejects.toThrow(
      'Model with id non-existent-model not found',
    );
    expect(mockDbGetModelById).toHaveBeenCalledWith('non-existent-model');
  });
});

describe('getSpeechModelByName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a speech model when found', async () => {
    const mockModel = {
      id: 'speech-model',
      name: 'speech',
      provider: 'ionos',
      priceMetadata: { type: 'speech', priceInCentPer1MillionCharacters: 100 },
    };
    mockDbGetModelByNameAndApiKeyId.mockResolvedValue(mockModel as never);

    await expect(getSpeechModelByName('speech', 'api-key')).resolves.toEqual(mockModel);
    expect(mockDbGetModelByNameAndApiKeyId).toHaveBeenCalledWith({
      name: 'speech',
      apiKeyId: 'api-key',
    });
  });

  it('should reject missing and incorrectly typed models', async () => {
    mockDbGetModelByNameAndApiKeyId.mockResolvedValue(null as never);
    await expect(getSpeechModelByName('missing', 'api-key')).rejects.toThrow(
      'No speech model with name missing found for this API key',
    );

    mockDbGetModelByNameAndApiKeyId.mockResolvedValue({
      priceMetadata: { type: 'text' },
    } as never);
    await expect(getSpeechModelByName('text', 'api-key')).rejects.toThrow(
      'Model text is not a speech model',
    );
  });
});
