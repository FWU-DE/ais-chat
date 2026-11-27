/**
 * Native streaming utilities for Server Actions.
 * Replaces ai/rsc's createStreamableValue and readStreamableValue.
 */

import {
  AiGenerationError,
  GenerationTimeoutError,
  isKnownAiGenerationError,
} from '@ais-chat/ai-core/errors';
import { BusinessError } from '@shared/error/business-error';
import { UnexpectedError } from '@shared/error/unexpected-error';
import { logError } from '@shared/logging';

import type { AiActivityStep } from '@/types/ai-activity';
import type { SerializedError } from '@/types/chat';

const STREAM_EVENT_PREFIX = '\u001e';

export type ChatStreamEvent =
  | {
      type: 'ai_activity';
      steps: AiActivityStep[];
    }
  | {
      type: 'error';
      error: SerializedError;
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

    if (event.type === 'ai_activity') {
      return event;
    }

    if (
      event.type === 'error' &&
      typeof event.error?.name === 'string' &&
      typeof event.error?.message === 'string'
    ) {
      return event;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Serializes an error for the stream. Only known, user-facing errors keep their name and message;
 * anything else (including the generic AiGenerationError, whose message may contain provider
 * details) is replaced by an UnexpectedError.
 */
export function serializeStreamError(error: Error): SerializedError {
  const isSafeToExpose =
    error instanceof BusinessError ||
    (isKnownAiGenerationError(error) && !AiGenerationError.is(error));
  const exposedError = isSafeToExpose ? error : new UnexpectedError();
  return { name: exposedError.name, message: exposedError.message };
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
    () => abandon('generation exceeded maximum duration', { notifyConsumer: true }),
    maxDurationMs,
  );
  let idleTimer: ReturnType<typeof setTimeout>;

  function clearTimers() {
    clearTimeout(maxDurationTimer);
    clearTimeout(idleTimer);
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => abandon('producer stopped emitting text', { notifyConsumer: true }),
      idleTimeoutMs,
    );
  }

  function enqueueErrorEvent(err: Error) {
    try {
      controller.enqueue(
        encodeChatStreamEvent({ type: 'error', error: serializeStreamError(err) }),
      );
    } catch (enqueueErr) {
      logError('createTextStream: failed to enqueue error event; stream may be closed', enqueueErr);
    }
  }

  /**
   * Stops the stream and aborts the producer. With `notifyConsumer`, the consumer is still
   * listening (timeouts), so it gets a GenerationTimeoutError event before the stream closes.
   */
  function abandon(reason: string, { notifyConsumer = false }: { notifyConsumer?: boolean } = {}) {
    if (abandoned || finished) return;
    abandoned = true;
    clearTimers();
    abortController.abort(new Error(reason));
    if (notifyConsumer) {
      const timeoutError = new GenerationTimeoutError(reason);
      logError('createTextStream: generation timed out', timeoutError, {
        maxDurationMs,
        idleTimeoutMs,
      });
      enqueueErrorEvent(timeoutError);
    }
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
    // Errors are sent as an in-stream event instead of erroring the stream, because React
    // strips the name and message of stream errors in production builds.
    error: (err: Error) => {
      clearTimers();
      finished = true;
      if (abandoned) return;
      enqueueErrorEvent(err);
      try {
        controller.close();
      } catch (caughtErr) {
        logError(
          'createTextStream.error: failed to close stream; it may already be closed',
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
