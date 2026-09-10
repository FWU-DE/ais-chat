import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateImageWithBilling } from './index';
import { AiGenerationError, InvalidModelError, ResponsibleAIError } from '../errors';
import type { AiModel } from './types';

// Mock all dependencies
vi.mock('./providers', () => ({
  generateImage: vi.fn(),
}));

vi.mock('../api-keys/billing', () => ({
  billImageGenerationUsageToApiKey: vi.fn(),
  isApiKeyOverQuota: vi.fn(),
}));

vi.mock('../api-keys/model-access', () => ({
  hasAccessToModel: vi.fn(),
}));

vi.mock('../models', () => ({
  getImageModelById: vi.fn(),
}));

vi.mock('../safety', () => ({
  checkInputSafety: vi.fn(),
}));

import { generateImage } from './providers';
import { billImageGenerationUsageToApiKey, isApiKeyOverQuota } from '../api-keys/billing';
import { hasAccessToModel } from '../api-keys/model-access';
import { getImageModelById } from '../models';
import { checkInputSafety } from '../safety';

const mockGenerateImage = vi.mocked(generateImage);
const mockBillImageGenerationUsageToApiKey = vi.mocked(billImageGenerationUsageToApiKey);
const mockIsApiKeyOverQuota = vi.mocked(isApiKeyOverQuota);
const mockHasAccessToModel = vi.mocked(hasAccessToModel);
const mockGetImageModelById = vi.mocked(getImageModelById);
const mockCheckInputSafety = vi.mocked(checkInputSafety);

describe('generateImageWithBilling', () => {
  const mockModel: AiModel = {
    id: 'model-123',
    name: 'test-model',
    provider: 'ionos',
    priceMetadata: {
      type: 'image',
      pricePerImageInCent: 50,
    },
  } as AiModel;

  const mockImageResponse = {
    data: ['base64-image-data'],
    output_format: 'png' as const,
    usage: {
      input_text_tokens: 1_000_000,
      output_text_tokens: 1_000_000,
      output_image_tokens: 1_000_000,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully generate image with billing', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateImage.mockResolvedValue(mockImageResponse);
    mockBillImageGenerationUsageToApiKey.mockResolvedValue(50);

    const result = await generateImageWithBilling('model-123', 'test prompt', 'api-key-123');

    expect(mockGetImageModelById).toHaveBeenCalledWith('model-123');
    expect(mockHasAccessToModel).toHaveBeenCalledWith('api-key-123', mockModel);
    expect(mockIsApiKeyOverQuota).toHaveBeenCalledWith('api-key-123');
    expect(mockGenerateImage).toHaveBeenCalledWith(mockModel, 'test prompt', undefined);
    expect(mockBillImageGenerationUsageToApiKey).toHaveBeenCalledWith(
      'api-key-123',
      mockModel,
      mockImageResponse.usage,
    );
    expect(result).toEqual({
      ...mockImageResponse,
      priceInCents: 50,
    });
  });

  it('checks the prompt and input images before generation', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateImage.mockResolvedValue(mockImageResponse);
    mockBillImageGenerationUsageToApiKey.mockResolvedValue(50);

    const inputImage = {
      data: Buffer.from('image-data'),
      mimeType: 'image/png',
      filename: 'input.png',
    };

    await generateImageWithBilling(
      'model-123',
      'test prompt',
      'api-key-123',
      {
        size: '1024x1024',
        inputImages: [inputImage],
      },
      'safety-model',
    );

    expect(mockCheckInputSafety).toHaveBeenCalledWith(
      'safety-model',
      [
        {
          role: 'user',
          content: 'test prompt',
          images: [
            {
              type: 'image',
              contentType: 'image/png',
              url: `data:image/png;base64,${inputImage.data.toString('base64')}`,
            },
          ],
        },
      ],
      'api-key-123',
    );
    expect(mockCheckInputSafety.mock.invocationCallOrder[0]).toBeLessThan(
      mockGenerateImage.mock.invocationCallOrder[0]!,
    );
  });

  it('should throw InvalidModelError when API key does not have access', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(false);
    mockIsApiKeyOverQuota.mockResolvedValue(false);

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow(InvalidModelError);

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow('API key does not have access to the image model: test-model');

    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockBillImageGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should throw AiGenerationError when API key is over quota', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(true);

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow(AiGenerationError);

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow('API key has exceeded its monthly quota');

    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockBillImageGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should run access check and quota check in parallel', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateImage.mockResolvedValue(mockImageResponse);
    mockBillImageGenerationUsageToApiKey.mockResolvedValue(50);

    await generateImageWithBilling('model-123', 'test prompt', 'api-key-123');

    // Both should be called
    expect(mockHasAccessToModel).toHaveBeenCalledTimes(1);
    expect(mockIsApiKeyOverQuota).toHaveBeenCalledTimes(1);
  });

  it('should wrap non-AiGenerationError errors', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateImage.mockRejectedValue(new Error('Network error'));

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow(AiGenerationError);

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow('Image generation failed: Network error');

    expect(mockBillImageGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should map explicit safety system rejections to ResponsibleAIError', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateImage.mockRejectedValue(
      new Error('400 Your request was rejected by the safety system. Request ID: secret'),
    );

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow(ResponsibleAIError);
  });

  it('should not wrap AiGenerationError errors', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    const originalError = new InvalidModelError('Original error');
    mockGenerateImage.mockRejectedValue(originalError);

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow(originalError);

    expect(mockBillImageGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should handle string errors during generation', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
    mockGenerateImage.mockRejectedValue('String error');

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow('Image generation failed: String error');
  });
});
