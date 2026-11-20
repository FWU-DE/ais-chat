import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AiGenerationError,
  ApiKeyUnusableError,
  InvalidModelError,
  ResponsibleAIError,
} from '../errors';
import { generateImageWithBilling } from './index';
import type { AiModel } from './types';

// Mock all dependencies
vi.mock('./providers', () => ({
  generateImage: vi.fn(),
}));

vi.mock('../api-keys/billing', () => ({
  billImageGenerationUsageToApiKey: vi.fn(),
}));

vi.mock('../api-keys/access', () => ({
  assertApiKeyCanUseModel: vi.fn(),
}));

vi.mock('../models', () => ({
  getImageModelById: vi.fn(),
}));

vi.mock('../safety', () => ({
  checkInputSafety: vi.fn(),
  buildImageSafetyMessages: vi.fn((prompt: string, inputImages = []) => [
    {
      role: 'user',
      content: prompt,
      images: inputImages.map((image: { mimeType: string; data: Buffer }) => ({
        type: 'image' as const,
        contentType: image.mimeType,
        url: `data:${image.mimeType};base64,${image.data.toString('base64')}`,
      })),
    },
  ]),
}));

import { assertApiKeyCanUseModel } from '../api-keys/access';
import { billImageGenerationUsageToApiKey } from '../api-keys/billing';
import { getImageModelById } from '../models';
import { checkInputSafety } from '../safety';
import { generateImage } from './providers';

const mockGenerateImage = vi.mocked(generateImage);
const mockBillImageGenerationUsageToApiKey = vi.mocked(billImageGenerationUsageToApiKey);
const mockAssertApiKeyCanUseModel = vi.mocked(assertApiKeyCanUseModel);
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
    safetyFilterEnabled: true,
  } as AiModel;

  const mockImageResponse = {
    data: ['base64-image-data'],
    output_format: 'png' as const,
    usage: {
      input_text_tokens: 1_000_000,
      input_image_tokens: 1_000_000,
      output_text_tokens: 1_000_000,
      output_image_tokens: 1_000_000,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully generate image with billing', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockGenerateImage.mockResolvedValue(mockImageResponse);
    mockBillImageGenerationUsageToApiKey.mockResolvedValue(50);

    const result = await generateImageWithBilling('model-123', 'test prompt', 'api-key-123');

    expect(mockGetImageModelById).toHaveBeenCalledWith('model-123');
    expect(mockAssertApiKeyCanUseModel).toHaveBeenCalledWith('api-key-123', mockModel, 'image');
    expect(mockGenerateImage).toHaveBeenCalledWith(mockModel, 'test prompt', undefined);
    expect(mockBillImageGenerationUsageToApiKey).toHaveBeenCalledWith(
      'api-key-123',
      mockModel,
      mockImageResponse.usage,
    );
    expect(result).toEqual({
      ...mockImageResponse,
      provider: mockModel.provider,
      modelName: mockModel.name,
      priceInCents: 50,
    });
  });

  it('checks the prompt and input images before generation', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
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

  it('runs the safety pre-check by default when a safety model is supplied', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockGenerateImage.mockResolvedValue(mockImageResponse);
    mockBillImageGenerationUsageToApiKey.mockResolvedValue(50);

    await generateImageWithBilling(
      'model-123',
      'test prompt',
      'api-key-123',
      undefined,
      'safety-model',
    );

    expect(mockCheckInputSafety).toHaveBeenCalled();
  });

  it('skips the safety pre-check for a model with safety filtering disabled', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockGenerateImage.mockResolvedValue(mockImageResponse);
    mockBillImageGenerationUsageToApiKey.mockResolvedValue(50);
    mockGetImageModelById.mockResolvedValue({ ...mockModel, safetyFilterEnabled: false });

    await generateImageWithBilling(
      'model-123',
      'test prompt',
      'api-key-123',
      undefined,
      'safety-model',
    );

    expect(mockCheckInputSafety).not.toHaveBeenCalled();
    expect(mockGenerateImage).toHaveBeenCalled();
  });

  it('blocks input images that exceed the safety model limit', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);

    await expect(
      generateImageWithBilling(
        'model-123',
        'test prompt',
        'api-key-123',
        {
          size: '1024x1024',
          inputImages: [
            {
              data: Buffer.alloc(8 * 1024 * 1024),
              mimeType: 'image/png',
              filename: 'large.png',
            },
          ],
        },
        'safety-model',
      ),
    ).rejects.toThrow(ResponsibleAIError);

    expect(mockCheckInputSafety).not.toHaveBeenCalled();
    expect(mockGenerateImage).not.toHaveBeenCalled();
  });

  it('should not generate when the API key check fails', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockAssertApiKeyCanUseModel.mockRejectedValueOnce(
      new ApiKeyUnusableError({ apiKeyId: 'api-key-123', reason: 'Api key is expired' }),
    );

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow(ApiKeyUnusableError);

    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockBillImageGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should wrap non-AiGenerationError errors', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
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
    mockGenerateImage.mockRejectedValue(
      new Error('400 Your request was rejected by the safety system. Request ID: secret'),
    );

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow(ResponsibleAIError);
  });

  it('should not wrap AiGenerationError errors', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    const originalError = new InvalidModelError('Original error');
    mockGenerateImage.mockRejectedValue(originalError);

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow(originalError);

    expect(mockBillImageGenerationUsageToApiKey).not.toHaveBeenCalled();
  });

  it('should handle string errors during generation', async () => {
    mockGetImageModelById.mockResolvedValue(mockModel);
    mockGenerateImage.mockRejectedValue('String error');

    await expect(
      generateImageWithBilling('model-123', 'test prompt', 'api-key-123'),
    ).rejects.toThrow('Image generation failed: String error');
  });
});
