import { logError } from '@shared/logging';

/**
 * Adapts a `ReadableStream<Uint8Array>` (e.g. a fetch `Response.body`) into an `AsyncIterable`,
 * so PCM audio chunks can be consumed with `for await`/`yield*` the same way as any other
 * generator-based stream in this codebase.
 */
export async function* readableStreamToAsyncIterable(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array, void, unknown> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        return;
      }
      if (value) {
        yield value;
      }
    }
  } catch (error) {
    logError('Error reading speech audio stream', error);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
