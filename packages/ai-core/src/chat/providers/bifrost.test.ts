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

vi.mock('@sentry/server-utils', () => ({
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
    safetyFilterEnabled: true,
    modelConfig: null,
  } satisfies AiModel;
}

// Mirrors the real OpenAI SDK's `APIPromise`: `create()` returns a value with a synchronous
// `withResponse()` method that resolves to the parsed body plus the raw HTTP response.
function mockResponseWithHeaders(data: unknown, headers: Record<string, string> = {}) {
  return {
    withResponse: async () => ({ data, response: { headers: new Headers(headers) } }),
  };
}

describe('Bifrost chat provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the Responses API with a bare logical model name', async () => {
    responsesCreateMock.mockReturnValue(
      mockResponseWithHeaders({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Hello from Bifrost' }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      }),
    );

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
    responsesCreateMock.mockReturnValue(
      mockResponseWithHeaders({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Vertex' }] }],
        usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      }),
    );

    const model = createBifrostModel('google');
    const generateText = constructBifrostTextGenerationFn(model);

    await generateText({ messages: [{ role: 'user', content: 'Hello' }], model: model.name });

    expect(responsesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-5' }),
      expect.anything(),
    );
  });

  it('strips the anthropic prefix from logical model names', async () => {
    responsesCreateMock.mockReturnValue(
      mockResponseWithHeaders({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Claude' }] }],
        usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      }),
    );

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
      responsesCreateMock.mockReturnValue(
        mockResponseWithHeaders({
          [Symbol.asyncIterator]: async function* () {
            yield { type: 'response.output_text.delta', delta: 'Hello' };
            yield { type: 'response.output_text.delta', delta: ' world' };
            yield {
              type: eventType,
              response: { usage: { input_tokens: 4, output_tokens: 5, total_tokens: 9 } },
            };
          },
        }),
      );

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

  it('resolves provider/model from response headers, ignoring body extra_fields entirely', async () => {
    // Regression test: Bifrost only reliably reports the routed provider/model in response
    // headers for streaming requests; the body's `extra_fields` can carry a stale, empty
    // snapshot from an earlier chunk (see the comment on `BifrostExtraFields`), so it's not
    // read at all for this purpose.
    responsesCreateMock.mockReturnValue(
      mockResponseWithHeaders(
        {
          [Symbol.asyncIterator]: async function* () {
            yield { type: 'response.output_text.delta', delta: 'Hi' };
            yield {
              type: 'response.completed',
              response: {
                usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
                // Stale/empty placeholder, as actually observed from Bifrost on streaming calls.
                extra_fields: { request_type: '', routing_info: {}, chunk_index: 0 },
              },
            };
          },
        },
        {
          'x-bifrost-routing-info-provider': 'azure',
          'x-bifrost-routing-info-requested-model': 'gpt-5',
          'x-bifrost-routing-info-model': 'gpt-5',
        },
      ),
    );

    const model = createBifrostModel('azure');
    const streamText = constructBifrostTextStreamFn(model);
    const onComplete = vi.fn();

    const chunks: string[] = [];
    for await (const chunk of streamText(
      { messages: [{ role: 'user', content: 'Hi' }], model: model.name },
      onComplete,
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hi']);
    expect(onComplete).toHaveBeenCalledWith(
      { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      model.id,
    );
  });

  it('uses the actual deployment when identifying a fallback response', async () => {
    responsesCreateMock.mockReturnValue(
      mockResponseWithHeaders(
        {
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'Fallback' }] }],
          usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
        },
        {
          'x-bifrost-routing-info-requested-model': 'azure/primary',
          'x-bifrost-routing-info-model': 'openai/fallback',
        },
      ),
    );

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
