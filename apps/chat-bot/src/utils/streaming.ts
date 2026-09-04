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
 * Creates a streamable text value for Server Actions.
 * Returns a controller to update/complete the stream and a ReadableStream to consume.
 *
 * `signal` aborts once the consumer disappears, so the producer can tear down its own
 * upstream work instead of generating into a stream nobody reads.
 */
export function createTextStream(): {
  stream: ReadableStream<string>;
  signal: AbortSignal;
  update: (text: string) => void;
  done: () => void;
  error: (err: Error) => void;
} {
  let controller: ReadableStreamDefaultController<string>;
  let cancelledByConsumer = false;
  const abortController = new AbortController();

  const stream = new ReadableStream<string>({
    start(c) {
      controller = c;
    },
    cancel() {
      // Consumer canceled the stream (e.g., user reloaded or closed the tab)
      cancelledByConsumer = true;
      abortController.abort(new Error('consumer cancelled the stream'));
    },
  });

  return {
    stream,
    signal: abortController.signal,
    update: (text: string) => {
      if (cancelledByConsumer) return;
      try {
        controller.enqueue(text);
      } catch (err) {
        logError('createTextStream.update: failed to enqueue text; stream may be closed', err);
      }
    },
    done: () => {
      if (cancelledByConsumer) return;
      try {
        controller.close();
      } catch (err) {
        logError('createTextStream.done: failed to close stream; it may already be closed', err);
      }
    },
    error: (err: Error) => {
      if (cancelledByConsumer) return;
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
    reader.releaseLock();
  }
}
