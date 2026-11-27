import {
  AiGenerationError,
  GenerationTimeoutError,
  ProviderRateLimitExceededError,
} from '@ais-chat/ai-core/errors';
import { ForbiddenError } from '@shared/error';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatStreamEvent } from './streaming';
import {
  createTextStream,
  decodeChatStreamEvent,
  encodeChatStreamEvent,
  readTextStream,
  serializeStreamError,
} from './streaming';

async function readAll(stream: ReadableStream<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of readTextStream(stream)) {
    chunks.push(chunk);
  }
  return chunks;
}

vi.mock('@shared/logging', () => ({
  logError: vi.fn(),
}));

describe('encodeChatStreamEvent / decodeChatStreamEvent', () => {
  it('round-trips an ai activity event', () => {
    const event: ChatStreamEvent = {
      type: 'ai_activity',
      steps: [],
    };

    expect(decodeChatStreamEvent(encodeChatStreamEvent(event))).toEqual(event);
  });

  it('round-trips an error event', () => {
    const event: ChatStreamEvent = {
      type: 'error',
      error: { name: 'ProviderRateLimitExceededError', message: 'Rate limit' },
    };

    expect(decodeChatStreamEvent(encodeChatStreamEvent(event))).toEqual(event);
  });

  it('returns null for plain text chunks and malformed events', () => {
    expect(decodeChatStreamEvent('just some streamed text')).toBeNull();
    expect(decodeChatStreamEvent('\u001enot json')).toBeNull();
    expect(decodeChatStreamEvent('\u001e{"type":"something_else"}')).toBeNull();
    expect(decodeChatStreamEvent('\u001e{"type":"error"}')).toBeNull();
    expect(decodeChatStreamEvent('\u001e{"type":"error","error":{"name":1}}')).toBeNull();
  });
});

describe('serializeStreamError', () => {
  it('keeps name and message of known AI errors and business errors', () => {
    expect(serializeStreamError(new ProviderRateLimitExceededError('Rate limit'))).toEqual({
      name: 'ProviderRateLimitExceededError',
      message: 'Rate limit',
    });
    expect(serializeStreamError(new ForbiddenError('Not allowed'))).toEqual({
      name: 'ForbiddenError',
      message: 'Not allowed',
    });
  });

  it('replaces unknown errors and the generic AiGenerationError with UnexpectedError', () => {
    const unexpected = { name: 'UnexpectedError', message: 'Unexpected Error' };

    expect(serializeStreamError(new Error('db password leaked'))).toEqual(unexpected);
    expect(serializeStreamError(new AiGenerationError('provider: raw details'))).toEqual(
      unexpected,
    );
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

  it('sends an error event and closes the stream normally on error()', async () => {
    const { stream, update, error } = createTextStream();

    update('Partial');
    error(new ProviderRateLimitExceededError('Rate limit'));

    const chunks = await readAll(stream);

    expect(chunks[0]).toBe('Partial');
    expect(decodeChatStreamEvent(chunks[1]!)).toEqual({
      type: 'error',
      error: { name: 'ProviderRateLimitExceededError', message: 'Rate limit' },
    });
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

    it.each([
      ['maximum duration', { maxDurationMs: 1_000, idleTimeoutMs: 60_000 }],
      ['idle timeout', { maxDurationMs: 60_000, idleTimeoutMs: 1_000 }],
    ])('sends a GenerationTimeoutError event on %s', async (_name, options) => {
      const { stream, update } = createTextStream(options);

      update('Partial');
      vi.advanceTimersByTime(1_000);

      const chunks = await readAll(stream);
      const timeoutError = new GenerationTimeoutError();

      expect(chunks[0]).toBe('Partial');
      expect(decodeChatStreamEvent(chunks[1]!)).toMatchObject({
        type: 'error',
        error: { name: timeoutError.name },
      });
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
      const { signal, update, error } = createTextStream({
        maxDurationMs: 60_000,
        idleTimeoutMs: 1_000,
      });

      error(new Error('provider failed'));
      update('late chunk');

      vi.advanceTimersByTime(60_000);

      expect(signal.aborted).toBe(false);
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
