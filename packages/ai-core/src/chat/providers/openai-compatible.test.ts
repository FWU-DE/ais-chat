import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { AiGenerationError } from '../../errors';
import { streamOpenAICompatibleAgenticResponse } from './openai-compatible';

function mockResponseWithHeaders(data: unknown, headers: Record<string, string> = {}) {
  return {
    withResponse: async () => ({ data, response: { headers: new Headers(headers) } }),
  };
}

function createClient(events: unknown[]): OpenAI {
  return {
    responses: {
      create: vi.fn().mockReturnValue(
        mockResponseWithHeaders({
          [Symbol.asyncIterator]: async function* () {
            yield* events;
          },
        }),
      ),
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

  describe('tool calls', () => {
    const usage = { input_tokens: 1, output_tokens: 2, total_tokens: 3 };
    const expectedUsage = { promptTokens: 1, completionTokens: 2, totalTokens: 3 };

    async function collect(events: unknown[]) {
      const collected = [];
      for await (const event of streamOpenAICompatibleAgenticResponse({
        client: createClient(events),
        messages: [{ role: 'user', content: 'Hi' }],
        modelName: 'test-model',
        providerName: 'Test',
      })) {
        collected.push(event);
      }
      return collected;
    }

    it('yields a tool call without arguments when the stream has no argument or done events', async () => {
      const item = {
        type: 'function_call',
        id: 'call-1',
        call_id: 'call-1',
        name: 'test_tool',
        arguments: '',
      };

      const events = await collect([
        { type: 'response.output_item.added', output_index: 1, item },
        { type: 'response.completed', response: { usage, output: [item] } },
      ]);

      expect(events).toEqual([
        { type: 'tool_call', call: { id: 'call-1', name: 'test_tool', arguments: '' } },
        { type: 'finish', usage: expectedUsage },
      ]);
    });

    it('yields a tool call that is only present in the completed response', async () => {
      const events = await collect([
        {
          type: 'response.completed',
          response: {
            usage,
            output: [
              { type: 'message', id: 'msg-1' },
              {
                type: 'function_call',
                id: 'call-1',
                call_id: 'call-1',
                name: 'test_tool',
                arguments: '',
              },
            ],
          },
        },
      ]);

      expect(events).toEqual([
        { type: 'tool_call', call: { id: 'call-1', name: 'test_tool', arguments: '' } },
        { type: 'finish', usage: expectedUsage },
      ]);
    });

    it('does not duplicate the arguments of a streamed tool call', async () => {
      const args = '{"input": "value", "optional": null}';
      const item = {
        type: 'function_call',
        id: 'call-1',
        call_id: 'call-1',
        name: 'test_tool',
        arguments: args,
      };

      const events = await collect([
        {
          type: 'response.output_item.added',
          output_index: 1,
          item: { ...item, arguments: '' },
        },
        {
          type: 'response.function_call_arguments.delta',
          output_index: 1,
          delta: args.slice(0, 20),
        },
        {
          type: 'response.function_call_arguments.delta',
          output_index: 1,
          delta: args.slice(20),
        },
        { type: 'response.function_call_arguments.done', output_index: 1, arguments: args },
        { type: 'response.output_item.done', output_index: 1, item },
        { type: 'response.completed', response: { usage, output: [item] } },
      ]);

      expect(events).toEqual([
        { type: 'tool_call', call: { id: 'call-1', name: 'test_tool', arguments: args } },
        { type: 'finish', usage: expectedUsage },
      ]);
    });

    it('keeps the arguments of a streamed tool call when output_item.done is missing', async () => {
      const args = '{"input": "value"}';
      const item = {
        type: 'function_call',
        id: 'call-1',
        call_id: 'call-1',
        name: 'test_tool',
        arguments: args,
      };

      const events = await collect([
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { ...item, arguments: '' },
        },
        { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
        { type: 'response.completed', response: { usage, output: [item] } },
      ]);

      expect(events).toEqual([
        { type: 'tool_call', call: { id: 'call-1', name: 'test_tool', arguments: args } },
        { type: 'finish', usage: expectedUsage },
      ]);
    });
  });

  it('passes the raw HTTP response headers to getUsageInfo', async () => {
    const client = {
      responses: {
        create: vi.fn().mockReturnValue(
          mockResponseWithHeaders(
            {
              [Symbol.asyncIterator]: async function* () {
                yield { type: 'response.output_text.delta', delta: 'Hello' };
                yield {
                  type: 'response.completed',
                  response: {
                    usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
                    // Body extra_fields are deliberately ignored (see bifrost.ts); only the
                    // headers below should be used to resolve usage info.
                    extra_fields: { provider: 'from-body' },
                  },
                };
              },
            },
            { 'x-bifrost-provider': 'from-header' },
          ),
        ),
      },
    } as unknown as OpenAI;

    const getUsageInfo = vi.fn().mockReturnValue({ provider: 'resolved-provider' });
    const events = [];
    for await (const event of streamOpenAICompatibleAgenticResponse({
      client,
      messages: [{ role: 'user', content: 'Hi' }],
      modelName: 'test-model',
      providerName: 'Test',
      getUsageInfo,
    })) {
      events.push(event);
    }

    expect(getUsageInfo).toHaveBeenCalledWith(expect.any(Headers));
    expect(getUsageInfo.mock.calls[0]?.[0]?.get('x-bifrost-provider')).toBe('from-header');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'finish', provider: 'resolved-provider' }),
    );
  });

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
        create: vi.fn().mockReturnValue(
          mockResponseWithHeaders({
            [Symbol.asyncIterator]: async function* () {
              yield { type: 'response.output_text.delta', delta: 'Partial answer' };
              abortController.abort();
              throw Object.assign(new Error('Request was aborted.'), { name: 'AbortError' });
            },
          }),
        ),
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
        create: vi.fn().mockReturnValue(
          mockResponseWithHeaders({
            [Symbol.asyncIterator]: async function* () {
              yield { type: 'response.output_text.delta', delta: 'Partial' };
              throw new Error('upstream exploded');
            },
          }),
        ),
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
        create: vi.fn().mockReturnValue(
          mockResponseWithHeaders({
            [Symbol.asyncIterator]: async function* () {
              yield* [];
              abortController.abort();
              throw new Error('upstream exploded');
            },
          }),
        ),
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
