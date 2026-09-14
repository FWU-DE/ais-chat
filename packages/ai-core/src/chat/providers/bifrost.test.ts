import { beforeEach, describe, expect, it, vi } from 'vitest';
import { constructBifrostTextGenerationFn, constructBifrostTextStreamFn } from './bifrost';
import type { AiModel } from '../types';

const { responsesCreateMock, openAiConstructorMock, instrumentOpenAiClientMock, MockOpenAI } =
  vi.hoisted(() => {
    const responsesCreateMock = vi.fn();
    const openAiConstructorMock = vi.fn();
    const instrumentOpenAiClientMock = vi.fn((client) => client);

    class MockOpenAI {
      responses = {
        create: responsesCreateMock,
      };

      constructor(options: unknown) {
        openAiConstructorMock(options);
      }
    }

    return {
      responsesCreateMock,
      openAiConstructorMock,
      instrumentOpenAiClientMock,
      MockOpenAI,
    };
  });

vi.mock('openai', () => ({
  default: MockOpenAI,
}));

vi.mock('@sentry/core', () => ({
  instrumentOpenAiClient: instrumentOpenAiClientMock,
}));

vi.mock('@ais-chat/api-database', () => ({
  dbGetModelIdByProviderAndUpstreamName: vi.fn(),
}));

vi.mock('../../env', () => ({
  env: {
    bifrostApiKey: 'bifrost-api-key',
    bifrostBaseUrl: 'http://localhost:8089/openai/v1',
  },
}));

function createBifrostModel(settingProvider: 'azure' | 'openai' | 'ionos' | 'google'): AiModel {
  return {
    id: 'model-bifrost',
    name: 'gpt-5',
    displayName: 'GPT-5',
    provider: 'bifrost',
    setting:
      settingProvider === 'google'
        ? { provider: 'google', projectId: 'project', location: 'europe-west3' }
        : {
            provider: settingProvider,
            apiKey: 'upstream-api-key',
            baseUrl: 'https://example.com/v1',
          },
    additionalParameters: { reasoning: { effort: 'low' } },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    description: 'Bifrost test model',
    isDeleted: false,
    useBifrost: true,
    isNew: false,
    organizationId: 'organization-id',
    priceMetadata: {
      type: 'text',
      completionTokenPrice: 1,
      promptTokenPrice: 1,
    },
    supportedImageFormats: [],
    imageGenerationConfig: null,
  } satisfies AiModel;
}

describe('Bifrost chat provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the Responses API with a bare logical model name', async () => {
    responsesCreateMock.mockResolvedValue({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Hello from Bifrost' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    });

    const model = createBifrostModel('azure');
    const generateText = constructBifrostTextGenerationFn(model);

    const result = await generateText({
      messages: [{ role: 'user', content: 'Hello' }],
      model: model.name,
      maxTokens: 128,
      temperature: 0.5,
    });

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: 'bifrost-api-key',
      baseURL: 'http://localhost:8089/openai/v1',
      defaultHeaders: { 'x-bf-vk': 'bifrost-api-key' },
    });
    expect(responsesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5',
        stream: false,
        max_output_tokens: 128,
        reasoning: { effort: 'low' },
      }),
      expect.anything(),
    );
    expect(responsesCreateMock.mock.calls[0]?.[0]).not.toHaveProperty('temperature');
    expect(result).toEqual({
      text: 'Hello from Bifrost',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
  });

  it('uses the same logical name regardless of provider settings', async () => {
    responsesCreateMock.mockResolvedValue({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Vertex' }] }],
      usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    });

    const model = createBifrostModel('google');
    const generateText = constructBifrostTextGenerationFn(model);

    await generateText({ messages: [{ role: 'user', content: 'Hello' }], model: model.name });

    expect(responsesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-5' }),
      expect.anything(),
    );
  });

  it('strips the anthropic prefix from logical model names', async () => {
    responsesCreateMock.mockResolvedValue({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Claude' }] }],
      usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    });

    const model = {
      ...createBifrostModel('google'),
      name: 'anthropic/claude-3-5-sonnet-v2@20241022',
    };
    const generateText = constructBifrostTextGenerationFn(model);

    await generateText({ messages: [{ role: 'user', content: 'Hello' }], model: model.name });

    expect(responsesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-3-5-sonnet-v2@20241022' }),
      expect.anything(),
    );
  });

  it.each(['response.completed', 'response.incomplete', 'response.failed'] as const)(
    'streams text and captures usage from a %s event',
    async (eventType) => {
      responsesCreateMock.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'response.output_text.delta', delta: 'Hello' };
          yield { type: 'response.output_text.delta', delta: ' world' };
          yield {
            type: eventType,
            response: { usage: { input_tokens: 4, output_tokens: 5, total_tokens: 9 } },
          };
        },
      });

      const model = createBifrostModel('ionos');
      const streamText = constructBifrostTextStreamFn(model);
      const onComplete = vi.fn();
      const chunks: string[] = [];

      for await (const chunk of streamText(
        { messages: [{ role: 'user', content: 'Hello' }], model: model.name },
        onComplete,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world']);
      expect(responsesCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-5' }),
        expect.anything(),
      );
      expect(onComplete).toHaveBeenCalledWith({
        promptTokens: 4,
        completionTokens: 5,
        totalTokens: 9,
      });
    },
  );

  it('uses the actual deployment when identifying a fallback response', async () => {
    responsesCreateMock.mockResolvedValue({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Fallback' }] }],
      usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      extra_fields: {
        model_requested: 'azure/primary',
        model_deployment: 'openai/fallback',
      },
    });

    const primary = createBifrostModel('azure');
    const fallback = {
      ...createBifrostModel('openai'),
      id: 'model-fallback',
      name: 'anthropic/fallback',
    };
    const generateText = constructBifrostTextGenerationFn(primary);

    const result = await generateText({
      messages: [{ role: 'user', content: 'Hello' }],
      model: primary.name,
      fallbackModels: [fallback],
    });

    expect(responsesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ fallbacks: ['fallback'] }),
      expect.anything(),
    );
    expect(result.modelId).toBe('model-fallback');
  });
});
