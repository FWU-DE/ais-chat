import { beforeEach, describe, expect, it, vi } from 'vitest';
import { constructAzureResponsesGenerationFn, constructAzureResponsesStreamFn } from './azure';
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

function createAzureModel(additionalParameters: Record<string, unknown> = {}): AiModel {
  return {
    id: 'model-azure',
    name: 'azure-gpt-model',
    displayName: 'Azure GPT Model',
    provider: 'azure',
    setting: {
      provider: 'azure',
      apiKey: 'azure-api-key',
      baseUrl:
        'https://example.openai.azure.com/openai/deployments/chat-deploy?api-version=2024-02-15-preview',
    },
    additionalParameters,
    priceMetadata: {
      type: 'text',
      completionTokenPrice: 1,
      promptTokenPrice: 1,
    },
  } as AiModel;
}

describe('Azure Responses chat providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['response.completed', 'response.incomplete', 'response.failed'] as const)(
    'streams Azure Responses output and captures usage from a %s event',
    async (eventType) => {
      responsesCreateMock.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'response.output_text.delta', delta: 'Hello' };
          yield { type: 'response.output_text.delta', delta: ' world' };
          yield {
            type: eventType,
            response: {
              usage: {
                input_tokens: 10,
                output_tokens: 20,
                total_tokens: 30,
              },
            },
          };
        },
      });

      const model = createAzureModel({
        reasoning: { effort: 'low' },
      });
      const streamText = constructAzureResponsesStreamFn(model);
      const onComplete = vi.fn();
      const chunks: string[] = [];

      for await (const chunk of streamText(
        {
          messages: [{ role: 'user', content: 'Hello there' }],
          model: model.name,
          maxTokens: 128,
        },
        onComplete,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world']);
      expect(responsesCreateMock).toHaveBeenCalledTimes(1);
      expect(responsesCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'chat-deploy',
          stream: true,
          max_output_tokens: 128,
          reasoning: { effort: 'low' },
        }),
        {
          path: '/openai/responses',
        },
      );

      const requestPayload = responsesCreateMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(requestPayload).not.toHaveProperty('temperature');
      expect(onComplete).toHaveBeenCalledWith({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    },
  );

  it('generates Azure Responses text and usage without forwarding temperature', async () => {
    responsesCreateMock.mockResolvedValue({
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: 'Test' },
            { type: 'output_text', text: ' response' },
          ],
        },
      ],
      usage: {
        input_tokens: 12,
        output_tokens: 18,
        total_tokens: 30,
      },
    });

    const model = createAzureModel({
      metadata: { source: 'unit-test' },
    });
    const generateText = constructAzureResponsesGenerationFn(model);

    const result = await generateText({
      messages: [{ role: 'user', content: 'Generate something' }],
      model: model.name,
      maxTokens: 256,
    });

    expect(responsesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'chat-deploy',
        stream: false,
        max_output_tokens: 256,
        metadata: { source: 'unit-test' },
      }),
      {
        path: '/openai/responses',
      },
    );
    const requestPayload = responsesCreateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(requestPayload).not.toHaveProperty('temperature');
    expect(result).toEqual({
      text: 'Test response',
      usage: {
        promptTokens: 12,
        completionTokens: 18,
        totalTokens: 30,
      },
    });
    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: 'azure-api-key',
      baseURL: 'https://example.openai.azure.com',
      defaultQuery: {
        'api-version': '2025-04-01-preview',
      },
    });
  });
});
