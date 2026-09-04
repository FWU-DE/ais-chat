/* eslint-disable @typescript-eslint/only-throw-error */
/* eslint-disable require-yield */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  constructGoogleAnthropicTextGenerationFn,
  constructGoogleAnthropicTextStreamFn,
  constructGoogleAnthropicAgenticStreamFn,
} from './google-anthropic';
import { AiGenerationError, RateLimitExceededError } from '../../errors';
import type { AiModel, Message } from '../types';

const { createMock, streamMock, finalMessageMock, MockAnthropicVertex, constructorMock } =
  vi.hoisted(() => {
    const createMock = vi.fn();
    const finalMessageMock = vi.fn();
    const constructorMock = vi.fn();

    const streamMock = vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        // Default: empty stream
      },
      finalMessage: finalMessageMock,
    });

    class MockAnthropicVertex {
      messages = {
        create: createMock,
        stream: streamMock,
      };

      constructor(options: unknown) {
        constructorMock(options);
      }
    }

    return {
      createMock,
      streamMock,
      finalMessageMock,
      MockAnthropicVertex,
      constructorMock,
    };
  });

vi.mock('@anthropic-ai/vertex-sdk', () => ({
  AnthropicVertex: MockAnthropicVertex,
}));

vi.mock('@sentry/core', () => ({
  instrumentAnthropicAiClient: vi.fn((client) => client),
}));

function createGoogleAnthropicModel(projectId = 'test-project', location = 'us-central1'): AiModel {
  return {
    id: 'model-google-anthropic',
    name: 'anthropic/claude-3-5-sonnet-v2@20241022',
    displayName: 'Claude 3.5 Sonnet v2',
    provider: 'google',
    description: 'Test model',
    organizationId: 'org-test',
    createdAt: new Date(),
    supportedImageFormats: ['image/png', 'image/jpeg'],
    imageGenerationConfig: null,
    additionalParameters: {},
    isNew: false,
    isDeleted: false,
    useBifrost: true,
    setting: {
      provider: 'google',
      projectId,
      location,
    },
    priceMetadata: {
      type: 'text',
      completionTokenPrice: 0.015,
      promptTokenPrice: 0.003,
    },
  };
}

describe('constructGoogleAnthropicTextGenerationFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create client with correct configuration', async () => {
    const model = createGoogleAnthropicModel('my-project', 'europe-west1');
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'response' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    await generateText({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'anthropic/claude-3-5-sonnet-v2@20241022',
    });

    expect(constructorMock).toHaveBeenCalledWith({
      projectId: 'my-project',
      region: 'europe-west1',
      maxRetries: 2,
    });
  });

  it('should throw error if provider is not google', () => {
    const invalidModel = {
      ...createGoogleAnthropicModel(),
      setting: { provider: 'azure' },
    } as unknown as AiModel;

    expect(() => constructGoogleAnthropicTextGenerationFn(invalidModel)).toThrow(
      'Invalid model configuration for Google Anthropic',
    );
  });

  it('should call messages.create with correct parameters', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'test' }],
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    const messages: Message[] = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ];

    await generateText({
      messages,
      maxTokens: 2000,
      model: 'anthropic/claude-3-5-sonnet-v2@20241022',
    });

    expect(createMock).toHaveBeenCalledWith({
      max_tokens: 2000,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      model: 'claude-3-5-sonnet-v2@20241022',
      stream: false,
      system: 'You are helpful',
    });
  });

  it('should use default maxTokens of 4096 when not specified', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'test' }],
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    await generateText({
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'anthropic/claude',
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 4096,
      }),
    );
  });

  it('should strip anthropic/ prefix from model name', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'test' }],
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    await generateText({
      messages: [{ role: 'user', content: 'test' }],
      model: 'anthropic/claude-sonnet',
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet',
      }),
    );
  });

  it('should filter out system and tool messages from conversation', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'test' }],
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    const messages: Message[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'User message' },
      { role: 'tool', content: 'Tool result', toolCallId: 'call_1' },
      { role: 'assistant', content: 'Assistant message' },
    ];

    await generateText({ messages, model: 'anthropic/claude' });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'User message' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Assistant message' }] },
        ],
        system: 'System prompt',
      }),
    );
  });

  it('should extract text from response content blocks', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockResolvedValue({
      content: [
        { type: 'text', text: 'First part' },
        { type: 'text', text: ' Second part' },
      ],
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    const result = await generateText({
      messages: [{ role: 'user', content: 'test' }],
      model: 'anthropic/claude',
    });

    expect(result.text).toBe('First part Second part');
  });

  it('should map token usage correctly', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'test' }],
      usage: { input_tokens: 100, output_tokens: 200 },
    });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    const result = await generateText({
      messages: [{ role: 'user', content: 'test' }],
      model: 'anthropic/claude',
    });

    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
    });
  });

  it('should include base64 image attachments in message', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'test' }],
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    const messages: Message[] = [
      {
        role: 'user',
        content: 'Describe this image',
        attachments: [
          {
            type: 'image',
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
            contentType: 'image/png',
          },
        ],
      },
    ];

    await generateText({ messages, model: 'anthropic/claude' });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'iVBORw0KGgoAAAANSUhEUgAAAAUA',
                },
              },
            ],
          },
        ],
      }),
    );
  });

  it('should ignore URL-based image attachments', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'test' }],
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    const messages: Message[] = [
      {
        role: 'user',
        content: 'Describe this',
        attachments: [
          {
            type: 'image',
            url: 'https://example.com/image.png',
            contentType: 'image/png',
          },
        ],
      },
    ];

    await generateText({ messages, model: 'anthropic/claude' });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Describe this' }],
          },
        ],
      }),
    );
  });

  it('should normalize image/jpg to image/jpeg', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'test' }],
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    const messages: Message[] = [
      {
        role: 'user',
        content: 'test',
        attachments: [
          {
            type: 'image',
            url: 'data:image/jpg;base64,/9j/4AAQSkZJRg==',
            contentType: 'image/jpg',
          },
        ],
      },
    ];

    await generateText({ messages, model: 'anthropic/claude' });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'test' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: '/9j/4AAQSkZJRg==',
                },
              },
            ],
          },
        ],
      }),
    );
  });

  it('should throw AiGenerationError for unsupported image content type', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockRejectedValue(
      new AiGenerationError('Unsupported image content type: image/bmp'),
    );

    const generateText = constructGoogleAnthropicTextGenerationFn(model);
    const messages: Message[] = [
      {
        role: 'user',
        content: 'test',
        attachments: [
          {
            type: 'image',
            url: 'data:image/bmp;base64,Qk02',
            contentType: 'image/bmp',
          },
        ],
      },
    ];

    await expect(generateText({ messages, model: 'anthropic/claude' })).rejects.toThrow(
      AiGenerationError,
    );
  });

  it('should throw error object for status 429', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockRejectedValue({ status: 429 });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);

    await expect(
      generateText({ messages: [{ role: 'user', content: 'test' }], model: 'anthropic/claude' }),
    ).rejects.toEqual({ status: 429 });
  });

  it('should throw error object for other HTTP errors', async () => {
    const model = createGoogleAnthropicModel();
    createMock.mockRejectedValue({ status: 500 });

    const generateText = constructGoogleAnthropicTextGenerationFn(model);

    await expect(
      generateText({ messages: [{ role: 'user', content: 'test' }], model: 'anthropic/claude' }),
    ).rejects.toEqual({ status: 500 });
  });

  it('should re-throw AiGenerationError as-is', async () => {
    const model = createGoogleAnthropicModel();
    const originalError = new AiGenerationError('Custom error');
    createMock.mockRejectedValue(originalError);

    const generateText = constructGoogleAnthropicTextGenerationFn(model);

    await expect(
      generateText({ messages: [{ role: 'user', content: 'test' }], model: 'anthropic/claude' }),
    ).rejects.toBe(originalError);
  });
});

describe('constructGoogleAnthropicTextStreamFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should yield text deltas from stream events', async () => {
    const model = createGoogleAnthropicModel();

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } };
      },
      finalMessage: finalMessageMock,
    });

    const generateTextStream = constructGoogleAnthropicTextStreamFn(model);
    const chunks: string[] = [];

    for await (const chunk of generateTextStream({
      messages: [{ role: 'user', content: 'test' }],
      model: 'anthropic/claude',
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('should call onComplete with usage on message_stop', async () => {
    const model = createGoogleAnthropicModel();
    const onComplete = vi.fn();

    finalMessageMock.mockResolvedValue({
      usage: { input_tokens: 50, output_tokens: 100 },
    });

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'test' } };
        yield { type: 'message_stop' };
      },
      finalMessage: finalMessageMock,
    });

    const generateTextStream = constructGoogleAnthropicTextStreamFn(model);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of generateTextStream(
      { messages: [{ role: 'user', content: 'test' }], model: 'anthropic/claude' },
      onComplete,
    )) {
      // consume stream
    }

    expect(onComplete).toHaveBeenCalledWith({
      promptTokens: 50,
      completionTokens: 100,
      totalTokens: 150,
    });
  });

  it('should not call onComplete if no usage available', async () => {
    const model = createGoogleAnthropicModel();
    const onComplete = vi.fn();

    finalMessageMock.mockResolvedValue({ usage: undefined });

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'message_stop' };
      },
      finalMessage: finalMessageMock,
    });

    const generateTextStream = constructGoogleAnthropicTextStreamFn(model);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of generateTextStream(
      { messages: [{ role: 'user', content: 'test' }], model: 'anthropic/claude' },
      onComplete,
    )) {
      // consume stream
    }

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('should handle rate limit errors (status 429)', async () => {
    const model = createGoogleAnthropicModel();

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        throw { status: 429 };
      },
      finalMessage: finalMessageMock,
    });

    const generateTextStream = constructGoogleAnthropicTextStreamFn(model);

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of generateTextStream({
        messages: [{ role: 'user', content: 'test' }],
        model: 'anthropic/claude',
      })) {
        // consume stream
      }
    }).rejects.toThrow(RateLimitExceededError);
  });

  it('should handle generic errors', async () => {
    const model = createGoogleAnthropicModel();

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        throw { status: 503 };
      },
      finalMessage: finalMessageMock,
    });

    const generateTextStream = constructGoogleAnthropicTextStreamFn(model);

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of generateTextStream({
        messages: [{ role: 'user', content: 'test' }],
        model: 'anthropic/claude',
      })) {
        // consume stream
      }
    }).rejects.toThrow(AiGenerationError);
  });
});

describe('constructGoogleAnthropicAgenticStreamFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should yield text deltas from stream events', async () => {
    const model = createGoogleAnthropicModel();

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } };
      },
      finalMessage: finalMessageMock,
    });

    const generateAgenticStream = constructGoogleAnthropicAgenticStreamFn(model);
    const events = [];

    for await (const event of generateAgenticStream({
      messages: [{ role: 'user', content: 'test' }],
      model: 'anthropic/claude',
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'text', delta: 'Hello' },
      { type: 'text', delta: ' world' },
    ]);
  });

  it('should yield tool calls and usage on message_stop', async () => {
    const model = createGoogleAnthropicModel();

    finalMessageMock.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_123',
          name: 'get_weather',
          input: { city: 'Paris' },
        },
      ],
      usage: { input_tokens: 50, output_tokens: 100 },
    });

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'message_stop' };
      },
      finalMessage: finalMessageMock,
    });

    const generateAgenticStream = constructGoogleAnthropicAgenticStreamFn(model);
    const events = [];

    for await (const event of generateAgenticStream({
      messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
      model: 'anthropic/claude',
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
    })) {
      events.push(event);
    }

    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            name: 'get_weather',
          }),
        ],
      }),
      expect.anything(),
    );

    expect(events).toEqual([
      {
        type: 'tool_call',
        call: {
          id: 'toolu_123',
          name: 'get_weather',
          arguments: JSON.stringify({ city: 'Paris' }),
        },
      },
      {
        type: 'finish',
        usage: {
          promptTokens: 50,
          completionTokens: 100,
          totalTokens: 150,
        },
      },
    ]);
  });

  it('should handle multi-turn conversation with tool results', async () => {
    const model = createGoogleAnthropicModel();

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'It is sunny' } };
      },
      finalMessage: finalMessageMock,
    });

    const generateAgenticStream = constructGoogleAnthropicAgenticStreamFn(model);
    const messages: Message[] = [
      { role: 'user', content: 'What is the weather in Paris?' },
      {
        role: 'assistant',
        content: 'Let me check',
        toolCalls: [{ id: 'toolu_123', name: 'get_weather', arguments: '{"city":"Paris"}' }],
      },
      { role: 'tool', content: '72°F and sunny', toolCallId: 'toolu_123' },
    ];

    const events = [];
    for await (const event of generateAgenticStream({
      messages,
      model: 'anthropic/claude',
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
    })) {
      events.push(event);
    }

    // Verify messages were formatted correctly
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'What is the weather in Paris?' }] },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me check' },
              { type: 'tool_use', id: 'toolu_123', name: 'get_weather', input: { city: 'Paris' } },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_123',
                content: '72°F and sunny',
                is_error: false,
              },
            ],
          },
        ],
      }),
      expect.anything(),
    );

    expect(events).toEqual([{ type: 'text', delta: 'It is sunny' }]);
  });

  it('should group consecutive tool results into one user message', async () => {
    const model = createGoogleAnthropicModel();

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'message_stop' };
      },
      finalMessage: vi.fn().mockResolvedValue({
        content: [],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      }),
    });

    const generateAgenticStream = constructGoogleAnthropicAgenticStreamFn(model);
    const messages: Message[] = [
      { role: 'user', content: 'Compare weather in Paris and London' },
      {
        role: 'assistant',
        content: 'Let me check both',
        toolCalls: [
          { id: 'toolu_1', name: 'get_weather', arguments: '{"city":"Paris"}' },
          { id: 'toolu_2', name: 'get_weather', arguments: '{"city":"London"}' },
        ],
      },
      { role: 'tool', content: '72°F sunny', toolCallId: 'toolu_1' },
      { role: 'tool', content: '65°F rainy', toolCallId: 'toolu_2' },
    ];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of generateAgenticStream({
      messages,
      model: 'anthropic/claude',
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
    })) {
      // consume stream
    }

    // Verify consecutive tool results were grouped
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_1',
                content: '72°F sunny',
                is_error: false,
              },
              {
                type: 'tool_result',
                tool_use_id: 'toolu_2',
                content: '65°F rainy',
                is_error: false,
              },
            ],
          },
        ]),
      }),
      expect.anything(),
    );
  });

  it('should set is_error to true for tool results with errors', async () => {
    const model = createGoogleAnthropicModel();

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'message_stop' };
      },
      finalMessage: vi.fn().mockResolvedValue({
        content: [],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      }),
    });

    const generateAgenticStream = constructGoogleAnthropicAgenticStreamFn(model);
    const messages: Message[] = [
      { role: 'user', content: 'What is the weather in InvalidCity?' },
      {
        role: 'assistant',
        content: 'Let me check',
        toolCalls: [{ id: 'toolu_123', name: 'get_weather', arguments: '{"city":"InvalidCity"}' }],
      },
      { role: 'tool', content: 'Error: City not found', toolCallId: 'toolu_123' },
    ];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of generateAgenticStream({
      messages,
      model: 'anthropic/claude',
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
    })) {
      // consume stream
    }

    // Verify tool result with error has is_error: true (detected from "Error:" prefix)
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_123',
                content: 'Error: City not found',
                is_error: true,
              },
            ],
          },
        ]),
      }),
      expect.anything(),
    );
  });

  it('should handle rate limit errors (status 429)', async () => {
    const model = createGoogleAnthropicModel();

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        throw { status: 429 };
      },
      finalMessage: finalMessageMock,
    });

    const generateAgenticStream = constructGoogleAnthropicAgenticStreamFn(model);

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of generateAgenticStream({
        messages: [{ role: 'user', content: 'test' }],
        model: 'anthropic/claude',
      })) {
        // consume stream
      }
    }).rejects.toThrow(RateLimitExceededError);
  });

  it('should handle generic errors', async () => {
    const model = createGoogleAnthropicModel();

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        throw { status: 500 };
      },
      finalMessage: finalMessageMock,
    });

    const generateAgenticStream = constructGoogleAnthropicAgenticStreamFn(model);

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of generateAgenticStream({
        messages: [{ role: 'user', content: 'test' }],
        model: 'anthropic/claude',
      })) {
        // consume stream
      }
    }).rejects.toThrow(AiGenerationError);
  });

  it('should throw error if tool result is missing toolCallId', async () => {
    const model = createGoogleAnthropicModel();

    const generateAgenticStream = constructGoogleAnthropicAgenticStreamFn(model);
    const messages: Message[] = [
      { role: 'user', content: 'test' },
      { role: 'tool', content: 'result' } as Message, // missing toolCallId
    ];

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of generateAgenticStream({
        messages,
        model: 'anthropic/claude',
      })) {
        // consume stream
      }
    }).rejects.toThrow(AiGenerationError);
  });

  it('should not duplicate text when both streaming deltas and finalMessage contain text', async () => {
    const model = createGoogleAnthropicModel();

    finalMessageMock.mockResolvedValue({
      content: [
        { type: 'text', text: 'Hello world' }, // This is the FULL text (already streamed as deltas)
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
      stop_reason: 'end_turn',
    });

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        // Text is streamed as deltas
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } };
        // Then message_stop with finalMessage containing the same text
        yield { type: 'message_stop' };
      },
      finalMessage: finalMessageMock,
    });

    const generateAgenticStream = constructGoogleAnthropicAgenticStreamFn(model);
    const events = [];

    for await (const event of generateAgenticStream({
      messages: [{ role: 'user', content: 'test' }],
      model: 'anthropic/claude',
    })) {
      events.push(event);
    }

    // Should only have the streamed deltas + finish, NOT duplicate text from finalMessage
    expect(events).toEqual([
      { type: 'text', delta: 'Hello' },
      { type: 'text', delta: ' world' },
      {
        type: 'finish',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      },
    ]);

    // Verify the text would concatenate to "Hello world" once, not twice
    const textDeltas = events.filter((e) => e.type === 'text').map((e) => e.delta);
    expect(textDeltas.join('')).toBe('Hello world');
  });

  it('should yield text from finalMessage when no deltas were streamed (very short response)', async () => {
    const model = createGoogleAnthropicModel();

    finalMessageMock.mockResolvedValue({
      content: [
        { type: 'text', text: 'OK' }, // Very short response that was not streamed as deltas
      ],
      usage: { input_tokens: 10, output_tokens: 2 },
      stop_reason: 'end_turn',
    });

    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        // No content_block_delta events, just message_stop
        yield { type: 'message_stop' };
      },
      finalMessage: finalMessageMock,
    });

    const generateAgenticStream = constructGoogleAnthropicAgenticStreamFn(model);
    const events = [];

    for await (const event of generateAgenticStream({
      messages: [{ role: 'user', content: 'test' }],
      model: 'anthropic/claude',
    })) {
      events.push(event);
    }

    // Should have the text from finalMessage since no deltas were streamed
    expect(events).toEqual([
      { type: 'text', delta: 'OK' },
      {
        type: 'finish',
        usage: {
          promptTokens: 10,
          completionTokens: 2,
          totalTokens: 12,
        },
      },
    ]);
  });
});
