import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import { streamOpenAICompatibleAgenticResponse } from './openai-compatible';
import { AiGenerationError } from '../../errors';

function createClient(events: unknown[]): OpenAI {
  return {
    responses: {
      create: vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield* events;
        },
      }),
    },
  } as unknown as OpenAI;
}

describe('streamOpenAICompatibleAgenticResponse', () => {
  it.each(['response.completed', 'response.incomplete', 'response.failed'] as const)(
    'captures usage from a %s event',
    async (eventType) => {
      const client = createClient([
        { type: 'response.output_text.delta', delta: 'Hello' },
        {
          type: eventType,
          response: { usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } },
        },
      ]);

      const events = [];
      for await (const event of streamOpenAICompatibleAgenticResponse({
        client,
        messages: [{ role: 'user', content: 'Hi' }],
        modelName: 'test-model',
        providerName: 'Test',
      })) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: 'text', delta: 'Hello' },
        { type: 'finish', usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } },
      ]);
    },
  );

  it('still throws when no usage is ever returned', async () => {
    const client = createClient([{ type: 'response.output_text.delta', delta: 'Hello' }]);

    const generator = streamOpenAICompatibleAgenticResponse({
      client,
      messages: [{ role: 'user', content: 'Hi' }],
      modelName: 'test-model',
      providerName: 'Test',
    });

    const drain = async () => {
      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }
    };

    await expect(drain()).rejects.toThrow(AiGenerationError);
  });

  it('bills estimated usage when the stream is aborted mid-generation', async () => {
    const abortController = new AbortController();
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield { type: 'response.output_text.delta', delta: 'Partial answer' };
            abortController.abort();
            throw Object.assign(new Error('Request was aborted.'), { name: 'AbortError' });
          },
        }),
      },
    } as unknown as OpenAI;

    const events = [];
    for await (const event of streamOpenAICompatibleAgenticResponse({
      client,
      messages: [{ role: 'user', content: 'Hi' }],
      modelName: 'test-model',
      providerName: 'Test',
      abortSignal: abortController.signal,
    })) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: 'text', delta: 'Partial answer' });

    const finish = events[1];
    expect(finish?.type).toBe('finish');
    expect(finish?.type === 'finish' && finish.usage.estimated).toBe(true);
    expect(finish?.type === 'finish' && finish.usage.completionTokens).toBeGreaterThan(0);
    expect(finish?.type === 'finish' && finish.usage.promptTokens).toBeGreaterThan(0);
  });

  it('rethrows stream errors when nothing was aborted', async () => {
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield { type: 'response.output_text.delta', delta: 'Partial' };
            throw new Error('upstream exploded');
          },
        }),
      },
    } as unknown as OpenAI;

    const generator = streamOpenAICompatibleAgenticResponse({
      client,
      messages: [{ role: 'user', content: 'Hi' }],
      modelName: 'test-model',
      providerName: 'Test',
      abortSignal: new AbortController().signal,
    });

    const drain = async () => {
      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }
    };

    await expect(drain()).rejects.toThrow('upstream exploded');
  });

  it('rethrows unrelated stream errors when the signal was aborted', async () => {
    const abortController = new AbortController();
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield* [];
            abortController.abort();
            throw new Error('upstream exploded');
          },
        }),
      },
    } as unknown as OpenAI;

    const generator = streamOpenAICompatibleAgenticResponse({
      client,
      messages: [{ role: 'user', content: 'Hi' }],
      modelName: 'test-model',
      providerName: 'Test',
      abortSignal: abortController.signal,
    });

    await expect(generator.next()).rejects.toThrow('upstream exploded');
  });
});
