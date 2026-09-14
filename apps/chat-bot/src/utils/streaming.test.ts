import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatStreamEvent } from './streaming';
import {
  createTextStream,
  decodeChatStreamEvent,
  encodeChatStreamEvent,
  readTextStream,
} from './streaming';

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

  it('abandons the stream once the consumer stops draining it', () => {
    const { signal, update } = createTextStream();

    // One more than the queued chunk limit, so the last update sees a full queue.
    for (let i = 0; i <= 1000; i++) {
      update(`chunk ${i}`);
    }

    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).message).toBe('consumer stopped reading');
  });

  describe('with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('aborts the signal once the maximum duration elapses', () => {
      const { signal, update } = createTextStream({
        maxDurationMs: 1_000,
        idleTimeoutMs: 60_000,
      });

      update('still going');
      vi.advanceTimersByTime(1_000);

      expect(signal.aborted).toBe(true);
      expect((signal.reason as Error).message).toBe('generation exceeded maximum duration');
    });

    it('aborts the signal when the producer goes idle, and resets on each update', () => {
      const { signal, update } = createTextStream({
        maxDurationMs: 60_000,
        idleTimeoutMs: 1_000,
      });

      vi.advanceTimersByTime(900);
      update('activity');
      vi.advanceTimersByTime(900);

      expect(signal.aborted).toBe(false);

      vi.advanceTimersByTime(100);

      expect(signal.aborted).toBe(true);
      expect((signal.reason as Error).message).toBe('producer stopped emitting text');
    });

    it('does not abort after done(), even if a late update arrives', () => {
      const { signal, update, done } = createTextStream({
        maxDurationMs: 60_000,
        idleTimeoutMs: 1_000,
      });

      update('all of it');
      done();
      update('late chunk');

      vi.advanceTimersByTime(60_000);

      expect(signal.aborted).toBe(false);
    });

    it('does not abort after error(), even if a late update arrives', () => {
      const { stream, signal, update, error } = createTextStream({
        maxDurationMs: 60_000,
        idleTimeoutMs: 1_000,
      });

      error(new Error('provider failed'));
      update('late chunk');

      vi.advanceTimersByTime(60_000);

      expect(signal.aborted).toBe(false);

      // Keep the rejected stream from surfacing as an unhandled rejection.
      void stream.cancel().catch(() => {});
    });
  });
});

describe('readTextStream', () => {
  it('aborts the signal when the consumer stops reading early', async () => {
    const { stream, signal, update } = createTextStream();

    update('first');
    update('second');

    for await (const chunk of readTextStream(stream)) {
      expect(chunk).toBe('first');
      break;
    }

    expect(signal.aborted).toBe(true);
  });

  it('leaves the signal untouched when the producer completes normally', async () => {
    const { stream, signal, update, done } = createTextStream();

    update('all done');
    done();

    const chunks: string[] = [];
    for await (const chunk of readTextStream(stream)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['all done']);
    expect(signal.aborted).toBe(false);
  });
});
