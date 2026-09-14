import { beforeEach, describe, expect, it, vi } from 'vitest';
import { constructAzureImageGenerationFn } from './azure';
import { AiGenerationError, ProviderConfigurationError, ResponsibleAIError } from '../../errors';
import type { AiModel } from '../types';

const {
  generateMock,
  openAiConstructorMock,
  instrumentOpenAiClientMock,
  startSpanMock,
  MockOpenAI,
} = vi.hoisted(() => {
  const generateMock = vi.fn();
  const openAiConstructorMock = vi.fn();
  const startSpanMock = vi.fn((_, callback) => callback({ setAttribute: vi.fn() }));

  class MockOpenAI {
    images = {
      generate: generateMock,
    };

    constructor(options: unknown) {
      openAiConstructorMock(options);
    }
  }

  const instrumentOpenAiClientMock = vi.fn((client) => client);

  return {
    generateMock,
    openAiConstructorMock,
    instrumentOpenAiClientMock,
    startSpanMock,
    MockOpenAI,
  };
});

vi.mock('openai', () => ({
  default: MockOpenAI,
}));

vi.mock('@sentry/core', () => ({
  instrumentOpenAiClient: instrumentOpenAiClientMock,
  startSpan: startSpanMock,
}));

function createAzureModel(baseUrl: string): AiModel {
  return {
    id: 'model-azure',
    name: 'azure-image-model',
    displayName: 'Azure Image Model',
    provider: 'azure',
    setting: {
      provider: 'azure',
      apiKey: 'azure-api-key',
      baseUrl,
    },
    priceMetadata: {
      type: 'image',
      inputTextTokenPrice: 1,
      outputTextTokenPrice: 2,
      outputImageTokenPrice: 3,
    },
  } as AiModel;
}

describe('constructAzureImageGenerationFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const model = createAzureModel(
    'https://example.openai.azure.com/openai/deployments/image-deploy?api-version=2024-02-15-preview&foo=bar',
  );

  it('should generate images and map Azure usage data', async () => {
    generateMock.mockResolvedValue({
      data: [{ b64_json: 'base64-azure-image' }, { b64_json: undefined }],
      output_format: 'png',
      usage: {
        input_tokens_details: {
          text_tokens: 4,
        },
        output_tokens_details: {
          text_tokens: 5,
          image_tokens: 6,
        },
      },
    });

    const generateImage = constructAzureImageGenerationFn(model);
    const result = await generateImage({ prompt: 'azure prompt', model: model.name });

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: 'azure-api-key',
      baseURL: 'https://example.openai.azure.com',
      defaultQuery: {
        'api-version': '2025-04-01-preview',
        foo: 'bar',
      },
    });
    expect(generateMock).toHaveBeenCalledWith(
      {
        prompt: 'azure prompt',
        size: '1024x1024',
        n: 1,
        quality: 'medium',
      },
      {
        path: '/openai/deployments/image-deploy/images/generations',
      },
    );
    expect(result).toEqual({
      data: ['base64-azure-image'],
      output_format: 'png',
      usage: {
        input_text_tokens: 4,
        output_text_tokens: 5,
        output_image_tokens: 6,
      },
    });
  });

  it.each(['content_policy_violation', 'ResponsibleAIPolicyViolation'])(
    'should map %s to ResponsibleAIError',
    async (code) => {
      generateMock.mockRejectedValue({
        code,
        message: 'prompt blocked by Azure policy',
        status: 400,
      });

      const generateImage = constructAzureImageGenerationFn(model);

      await expect(
        generateImage({ prompt: 'azure prompt', model: model.name }),
      ).rejects.toBeInstanceOf(ResponsibleAIError);
      await expect(generateImage({ prompt: 'azure prompt', model: model.name })).rejects.toThrow(
        'Azure OpenAI Responsible AI Policy Violation: prompt blocked by Azure policy',
      );
    },
  );

  it('should throw when Azure OpenAI returns no usage data', async () => {
    const model = createAzureModel(
      'https://example.openai.azure.com/openai/deployments/image-deploy',
    );

    generateMock.mockResolvedValue({
      data: [{ b64_json: 'base64-azure-image' }],
      output_format: 'png',
    });

    const generateImage = constructAzureImageGenerationFn(model);

    await expect(generateImage({ prompt: 'azure prompt', model: model.name })).rejects.toThrow(
      AiGenerationError,
    );
    await expect(generateImage({ prompt: 'azure prompt', model: model.name })).rejects.toThrow(
      'No usage data received from Azure OpenAI',
    );
  });

  it('should reject malformed Azure deployment URLs', () => {
    const model = createAzureModel('https://example.openai.azure.com/openai');

    expect(() => constructAzureImageGenerationFn(model)).toThrow(ProviderConfigurationError);
    expect(() => constructAzureImageGenerationFn(model)).toThrow(
      'Invalid Azure baseUrl format. Expected format: https://{endpoint}.openai.azure.com/openai/deployments/{deployment-id}',
    );
  });
});
