import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import { chatCompletion, chatCompletionStream } from './chat';

const mocks = vi.hoisted(() => ({
  checkInputSafety: vi.fn(),
  generateTextByNameWithBilling: vi.fn(),
  generateTextStreamByNameWithBilling: vi.fn(),
}));

vi.mock('@ais-chat/ai-core', () => ({
  checkInputSafety: mocks.checkInputSafety,
  generateTextByNameWithBilling: mocks.generateTextByNameWithBilling,
  generateTextStreamByNameWithBilling: mocks.generateTextStreamByNameWithBilling,
}));

describe('chat safety integration', () => {
  const model = { name: 'test-model' };
  const usage = { promptTokens: 2, completionTokens: 3, totalTokens: 5 };
  const apiKeyId = 'api-key-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkInputSafety.mockResolvedValue(undefined);
    mocks.generateTextByNameWithBilling.mockResolvedValue({
      model,
      text: 'A safe answer',
      usage,
    });
    mocks.generateTextStreamByNameWithBilling.mockResolvedValue({
      model,
      stream: (function* () {
        yield 'A ';
        yield 'safe answer';
      })(),
    });
  });

  it('checks non-streaming input before generating and continues when safe', async () => {
    const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];

    const result = await chatCompletion({
      modelName: 'test-model',
      messages,
      apiKeyId,
      safetyModelName: 'safety-model',
      maxTokens: 20,
      temperature: 0.4,
    });

    expect(mocks.checkInputSafety).toHaveBeenCalledWith(
      'safety-model',
      [{ role: 'user', content: 'Hello', images: undefined }],
      apiKeyId,
    );
    expect(mocks.generateTextByNameWithBilling).toHaveBeenCalledWith(
      'test-model',
      [{ role: 'user', content: 'Hello' }],
      apiKeyId,
      { maxTokens: 20, temperature: 0.4 },
    );
    expect(result.choices[0]?.message.content).toBe('A safe answer');
  });

  it('blocks unsafe non-streaming input before text generation', async () => {
    const safetyError = new Error('Input was blocked by the safety model');
    mocks.checkInputSafety.mockRejectedValue(safetyError);
    const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Unsafe request' }];

    await expect(
      chatCompletion({
        modelName: 'test-model',
        messages,
        apiKeyId,
        safetyModelName: 'safety-model',
      }),
    ).rejects.toBe(safetyError);

    expect(mocks.generateTextByNameWithBilling).not.toHaveBeenCalled();
  });

  it('checks streaming input before generating and continues when safe', async () => {
    const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];

    const stream = await chatCompletionStream({
      modelName: 'test-model',
      messages,
      apiKeyId,
      safetyModelName: 'safety-model',
      maxTokens: 20,
      temperature: 0.4,
    });
    const output = new TextDecoder().decode(await new Response(stream).arrayBuffer());

    expect(mocks.checkInputSafety).toHaveBeenCalledWith(
      'safety-model',
      [{ role: 'user', content: 'Hello', images: undefined }],
      apiKeyId,
    );
    expect(mocks.generateTextStreamByNameWithBilling).toHaveBeenCalledWith(
      'test-model',
      [{ role: 'user', content: 'Hello' }],
      apiKeyId,
      undefined,
      { maxTokens: 20, temperature: 0.4 },
    );
    expect(output).toContain('"content":"A "');
    expect(output).toContain('"content":"safe answer"');
  });

  it('blocks unsafe streaming input before text generation', async () => {
    mocks.checkInputSafety.mockRejectedValue(new Error('Input was blocked by the safety model'));
    const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Unsafe request' }];

    await expect(
      chatCompletionStream({
        modelName: 'test-model',
        messages,
        apiKeyId,
        safetyModelName: 'safety-model',
      }),
    ).rejects.toThrow('Input was blocked by the safety model');

    expect(mocks.generateTextStreamByNameWithBilling).not.toHaveBeenCalled();
  });

  it('forwards the full user and assistant context and attachments to the safety check', async () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'user', content: 'Earlier message' },
      { role: 'assistant', content: 'Earlier answer' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image' },
          { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } },
        ],
      },
    ];

    await chatCompletion({
      modelName: 'test-model',
      messages,
      apiKeyId,
      safetyModelName: 'safety-model',
    });

    expect(mocks.checkInputSafety).toHaveBeenCalledWith(
      'safety-model',
      [
        { role: 'user', content: 'Earlier message', images: undefined },
        { role: 'assistant', content: 'Earlier answer', images: undefined },
        {
          role: 'user',
          content: 'Describe this image',
          images: [
            { type: 'image', url: 'https://example.com/photo.jpg', contentType: 'image/jpeg' },
          ],
        },
      ],
      apiKeyId,
    );
  });
});
