/**
 * Native streaming utilities for Server Actions.
 * Replaces ai/rsc's createStreamableValue and readStreamableValue.
 */

import type { WebSearchResult } from '@shared/db/schema';
import { logError } from '@shared/logging';

const STREAM_EVENT_PREFIX = '\u001e';

export type ChatStreamEvent = {
  type: 'web_search_results';
  webSearchResults: WebSearchResult[];
};

export function encodeChatStreamEvent(event: ChatStreamEvent): string {
  return `${STREAM_EVENT_PREFIX}${JSON.stringify(event)}`;
}

export function decodeChatStreamEvent(chunk: string): ChatStreamEvent | null {
  if (!chunk.startsWith(STREAM_EVENT_PREFIX)) {
    return null;
  }

  try {
    const event = JSON.parse(chunk.slice(STREAM_EVENT_PREFIX.length)) as ChatStreamEvent;

    if (event.type !== 'web_search_results') {
      return null;
    }

    return event;
  } catch {
    return null;
  }
}

/**
 * Number of chunks that may sit unread in the stream before the consumer is treated as gone.
 * A live client drains continuously, so a backlog this large means nobody is reading.
 */
const MAX_QUEUED_CHUNKS = 1000;

/** Hard ceiling for a single generation, independent of whether the client is still listening. */
const DEFAULT_MAX_DURATION_MS = 10 * 60 * 1000;

/**
 * Aborts a producer that has gone quiet, which would otherwise hold its upstream stream forever.
 * Generous enough to cover a slow agent iteration that runs tools before emitting any text.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Creates a streamable text value for Server Actions.
 * Returns a controller to update/complete the stream and a ReadableStream to consume.
 *
 * `signal` aborts when the consumer disappears, the producer goes idle, or the maximum duration
 * elapses, so the producer can tear down its own upstream work instead of leaking it.
 */
export function createTextStream({
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}: { maxDurationMs?: number; idleTimeoutMs?: number } = {}): {
  stream: ReadableStream<string>;
  signal: AbortSignal;
  update: (text: string) => void;
  done: () => void;
  error: (err: Error) => void;
} {
  let controller: ReadableStreamDefaultController<string>;
  let abandoned = false;
  let finished = false;
  const abortController = new AbortController();

  const maxDurationTimer = setTimeout(
    () => abandon('generation exceeded maximum duration'),
    maxDurationMs,
  );
  let idleTimer: ReturnType<typeof setTimeout>;

  function clearTimers() {
    clearTimeout(maxDurationTimer);
    clearTimeout(idleTimer);
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => abandon('producer stopped emitting text'), idleTimeoutMs);
  }

  function abandon(reason: string) {
    if (abandoned || finished) return;
    abandoned = true;
    clearTimers();
    abortController.abort(new Error(reason));
    try {
      controller.close();
    } catch {
      // Already closed or errored
    }
  }

  const stream = new ReadableStream<string>(
    {
      start(c) {
        controller = c;
      },
      cancel() {
        // Consumer canceled the stream (e.g., user reloaded or closed the tab)
        abandon('consumer cancelled the stream');
      },
    },
    new CountQueuingStrategy({ highWaterMark: MAX_QUEUED_CHUNKS }),
  );

  resetIdleTimer();

  return {
    stream,
    signal: abortController.signal,
    update: (text: string) => {
      if (abandoned || finished) return;

      if (controller.desiredSize !== null && controller.desiredSize <= 0) {
        logError(
          'createTextStream.update: consumer stopped reading, abandoning stream',
          new Error(`Queued chunk limit of ${MAX_QUEUED_CHUNKS} exceeded`),
        );
        abandon('consumer stopped reading');
        return;
      }

      resetIdleTimer();

      try {
        controller.enqueue(text);
      } catch (err) {
        logError('createTextStream.update: failed to enqueue text; stream may be closed', err);
      }
    },
    done: () => {
      clearTimers();
      finished = true;
      if (abandoned) return;
      try {
        controller.close();
      } catch (err) {
        logError('createTextStream.done: failed to close stream; it may already be closed', err);
      }
    },
    error: (err: Error) => {
      clearTimers();
      finished = true;
      if (abandoned) return;
      try {
        controller.error(err);
      } catch (caughtErr) {
        logError(
          'createTextStream.error: failed to signal error on stream; it may already be closed',
          caughtErr,
        );
      }
    },
  };
}

/**
 * Async generator to read chunks from a ReadableStream.
 * Use with for-await-of loop on the client side.
 */
export async function* readTextStream(
  stream: ReadableStream<string>,
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        yield value;
      }
    }
  } finally {
    // Cancels only when the stream is still readable, so an abandoned stream reaches its producer.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
