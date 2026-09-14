import { beforeEach, describe, expect, it, vi } from 'vitest';
import { constructBifrostImageGenerationFn } from './bifrost';
import type { AiModel } from '../types';
import { AiGenerationError } from '../../errors';

const {
  generateMock,
  editMock,
  toFileMock,
  openAiConstructorMock,
  instrumentOpenAiClientMock,
  MockOpenAI,
} = vi.hoisted(() => {
  const generateMock = vi.fn();
  const editMock = vi.fn();
  const openAiConstructorMock = vi.fn();
  const toFileMock = vi.fn(async (data: unknown, filename: string, opts: { type: string }) => ({
    __uploadable: true,
    data,
    filename,
    type: opts.type,
  }));

  class MockOpenAI {
    images = { generate: generateMock, edit: editMock };

    constructor(options: unknown) {
      openAiConstructorMock(options);
    }
  }

  const instrumentOpenAiClientMock = vi.fn((client) => client);

  return {
    generateMock,
    editMock,
    toFileMock,
    openAiConstructorMock,
    instrumentOpenAiClientMock,
    MockOpenAI,
  };
});

vi.mock('openai', () => ({ default: MockOpenAI, toFile: toFileMock }));

vi.mock('@sentry/core', () => ({ instrumentOpenAiClient: instrumentOpenAiClientMock }));

vi.mock('../../env', () => ({
  env: {
    bifrostApiKey: 'bifrost-api-key',
    bifrostBaseUrl: 'http://localhost:8089/openai/v1',
  },
}));

describe('constructBifrostImageGenerationFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates images through the Bifrost responses-compatible surface', async () => {
    generateMock.mockResolvedValue({
      data: [{ b64_json: 'base64-bifrost-image' }],
      output_format: 'png',
      usage: {
        input_tokens: 4,
        output_tokens: 5,
        output_tokens_details: {
          text_tokens: 2,
          image_tokens: 3,
        },
      },
    });

    const model = {
      id: 'model-bifrost-image',
      name: 'image-model',
      provider: 'bifrost',
      setting: { provider: 'azure', apiKey: 'unused', baseUrl: 'unused' },
    } as AiModel;

    const generateImage = constructBifrostImageGenerationFn(model);
    const result = await generateImage({ prompt: 'a cat', model: model.name });

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: 'bifrost-api-key',
      baseURL: 'http://localhost:8089/openai/v1',
      defaultHeaders: { 'x-bf-vk': 'bifrost-api-key' },
    });
    expect(generateMock).toHaveBeenCalledWith({
      model: 'image-model',
      prompt: 'a cat',
      n: 1,
      size: 'auto',
    });
    expect(result).toEqual({
      data: ['base64-bifrost-image'],
      output_format: 'png',
      usage: {
        input_text_tokens: 4,
        output_text_tokens: 2,
        output_image_tokens: 3,
      },
    });
  });

  it('uses provided size from options', async () => {
    generateMock.mockResolvedValue({
      data: [{ b64_json: 'base64-bifrost-image' }],
      output_format: 'png',
      usage: {
        input_tokens: 4,
        output_tokens: 5,
        output_tokens_details: { text_tokens: 2, image_tokens: 3 },
      },
    });

    const model = {
      id: 'model-bifrost-image',
      name: 'image-model',
      provider: 'bifrost',
      setting: { provider: 'azure', apiKey: 'unused', baseUrl: 'unused' },
    } as AiModel;

    const generateImage = constructBifrostImageGenerationFn(model);
    await generateImage({ prompt: 'a cat', model: model.name, options: { size: '1536x1024' } });

    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ size: '1536x1024' }));
  });

  it('preserves logical image model names containing a slash', async () => {
    generateMock.mockResolvedValue({
      data: [{ b64_json: 'base64-bifrost-image' }],
      output_format: 'png',
      usage: {
        input_tokens: 4,
        output_tokens: 5,
        output_tokens_details: {
          text_tokens: 2,
          image_tokens: 3,
        },
      },
    });

    const model = {
      id: 'model-bifrost-image',
      name: 'anthropic/claude-3-5-sonnet-v2@20241022',
      provider: 'bifrost',
      setting: { provider: 'google', projectId: 'project', location: 'europe-west3' },
    } as AiModel;

    const generateImage = constructBifrostImageGenerationFn(model);
    await generateImage({ prompt: 'a cat', model: model.name });

    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'anthropic/claude-3-5-sonnet-v2@20241022' }),
    );
  });

  it('throws when Bifrost returns no image data after mapping', async () => {
    generateMock.mockResolvedValue({
      data: [{ b64_json: undefined }],
      output_format: 'png',
      usage: {
        input_tokens: 4,
        output_tokens: 5,
        output_tokens_details: {
          text_tokens: 2,
          image_tokens: 3,
        },
      },
    });

    const model = {
      id: 'model-bifrost-image',
      name: 'image-model',
      provider: 'bifrost',
      setting: { provider: 'azure', apiKey: 'unused', baseUrl: 'unused' },
    } as AiModel;

    const generateImage = constructBifrostImageGenerationFn(model);

    await expect(generateImage({ prompt: 'a cat', model: model.name })).rejects.toBeInstanceOf(
      AiGenerationError,
    );
    await expect(generateImage({ prompt: 'a cat', model: model.name })).rejects.toThrow(
      'No image data received from Bifrost',
    );
  });

  describe('with inputImages', () => {
    const model = {
      id: 'model-bifrost-image',
      name: 'image-model',
      provider: 'bifrost',
      setting: { provider: 'azure', apiKey: 'unused', baseUrl: 'unused' },
    } as AiModel;

    const successfulEditResponse = {
      data: [{ b64_json: 'base64-edited-image' }],
      output_format: 'png',
      usage: {
        input_tokens: 7,
        output_tokens: 8,
        output_tokens_details: { text_tokens: 1, image_tokens: 6 },
      },
    };

    it('calls the images.edit endpoint instead of images.generate when input images are supplied', async () => {
      editMock.mockResolvedValue(successfulEditResponse);

      const generateImage = constructBifrostImageGenerationFn(model);
      const result = await generateImage({
        prompt: 'make it cyberpunk',
        model: model.name,
        options: {
          size: '1024x1024',
          inputImages: [{ data: Buffer.from('img-a'), mimeType: 'image/png', filename: 'a.png' }],
        },
      });

      expect(generateMock).not.toHaveBeenCalled();
      expect(editMock).toHaveBeenCalledTimes(1);
      expect(editMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'image-model',
          prompt: 'make it cyberpunk',
          n: 1,
          size: '1024x1024',
          image: expect.any(Array),
        }),
      );
      expect(result).toEqual({
        data: ['base64-edited-image'],
        output_format: 'png',
        usage: {
          input_text_tokens: 7,
          output_text_tokens: 1,
          output_image_tokens: 6,
        },
      });
    });

    it('converts every input image through toFile with matching mime type and filename', async () => {
      editMock.mockResolvedValue(successfulEditResponse);

      const generateImage = constructBifrostImageGenerationFn(model);
      await generateImage({
        prompt: 'edit',
        model: model.name,
        options: {
          size: 'auto',
          inputImages: [
            { data: Buffer.from('img-a'), mimeType: 'image/png', filename: 'a.png' },
            { data: Buffer.from('img-b'), mimeType: 'image/jpeg', filename: 'b.jpg' },
          ],
        },
      });

      expect(toFileMock).toHaveBeenCalledTimes(2);
      expect(toFileMock).toHaveBeenNthCalledWith(1, Buffer.from('img-a'), 'a.png', {
        type: 'image/png',
      });
      expect(toFileMock).toHaveBeenNthCalledWith(2, Buffer.from('img-b'), 'b.jpg', {
        type: 'image/jpeg',
      });

      const callArgs = editMock.mock.calls[0]?.[0] as { image: unknown[] };
      expect(callArgs.image).toHaveLength(2);
    });

    it('falls back to images.generate when the inputImages array is empty', async () => {
      generateMock.mockResolvedValue({
        data: [{ b64_json: 'base64-generated' }],
        output_format: 'png',
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          output_tokens_details: { text_tokens: 0, image_tokens: 1 },
        },
      });

      const generateImage = constructBifrostImageGenerationFn(model);
      await generateImage({
        prompt: 'a cat',
        model: model.name,
        options: { size: '1024x1024', inputImages: [] },
      });

      expect(editMock).not.toHaveBeenCalled();
      expect(generateMock).toHaveBeenCalledTimes(1);
    });
  });
});
