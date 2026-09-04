import { describe, it, expect, vi } from 'vitest';
import type { ChatStreamEvent } from './streaming';
import { createTextStream, decodeChatStreamEvent, encodeChatStreamEvent } from './streaming';

vi.mock('@shared/logging', () => ({
  logError: vi.fn(),
}));

describe('encodeChatStreamEvent / decodeChatStreamEvent', () => {
  it('round-trips a web search result event', () => {
    const event: ChatStreamEvent = {
      type: 'web_search_results',
      webSearchResults: [
        {
          type: 'text',
          name: 'Example',
          url: 'https://example.com',
          content: 'Example content',
          favicon: 'https://example.com/favicon.ico',
        },
      ],
    };

    expect(decodeChatStreamEvent(encodeChatStreamEvent(event))).toEqual(event);
  });

  it('returns null for plain text chunks and malformed events', () => {
    expect(decodeChatStreamEvent('just some streamed text')).toBeNull();
    expect(decodeChatStreamEvent('\u001enot json')).toBeNull();
    expect(decodeChatStreamEvent('\u001e{"type":"something_else"}')).toBeNull();
  });
});

describe('createTextStream', () => {
  it('streams updates to the consumer until done', async () => {
    const { stream, update, done } = createTextStream();

    update('Hello ');
    update('world.');
    done();

    const chunks: string[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<string>) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('Hello world.');
  });

  it('does not abort the signal while the consumer is still reading', () => {
    const { signal, update, done } = createTextStream();

    update('Hello');
    done();

    expect(signal.aborted).toBe(false);
  });

  it('aborts the signal when the consumer cancels the stream', async () => {
    const { stream, signal, update } = createTextStream();

    update('Partial');
    expect(signal.aborted).toBe(false);

    await stream.cancel();

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(Error);
  });

  it('ignores further producer calls after the consumer cancelled', async () => {
    const { stream, update, done, error } = createTextStream();

    await stream.cancel();

    expect(() => {
      update('ignored');
      done();
      error(new Error('ignored'));
    }).not.toThrow();
  });
});
