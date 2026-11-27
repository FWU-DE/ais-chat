import { afterEach, describe, expect, test, vi } from 'vitest';

import { BifrostProviderSyncError } from './error';
import { assertBifrostResponse, BIFROST_REQUEST_TIMEOUT_MS, bifrostFetch } from './http';

describe('assertBifrostResponse', () => {
  test('throws a sync error that carries the HTTP status but not the response body', async () => {
    const response = new Response('{"error":"secret detail"}', { status: 409 });

    const error = await assertBifrostResponse(Promise.resolve(response)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BifrostProviderSyncError);
    expect((error as BifrostProviderSyncError).status).toBe(409);
    expect(JSON.stringify(error)).not.toContain('secret detail');
  });
});

/**
 * A fetch that never finishes on its own. It rejects when the signal it was given aborts, and its
 * body stream errors the same way. The tests use no socket. A response resolves in a microtask,
 * which always runs before a timer, so the headers arrive before the limit however slow the
 * runner is. Only the abort itself waits for the (short) limit.
 */
function stubFetch(
  behaviour: 'no-response' | { status: number; stalledBody: string },
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((_url: URL, init: RequestInit) => {
    const signal = init.signal!;
    if (behaviour === 'no-response') {
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason as Error));
      });
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(behaviour.stalledBody));
        signal.addEventListener('abort', () => controller.error(signal.reason));
      },
    });
    return Promise.resolve(new Response(body, { status: behaviour.status }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const SHORT_LIMIT_MS = 20;

const request = (extra: { timeoutMs?: number; signal?: AbortSignal } = {}) =>
  bifrostFetch({
    bifrostAdminUrl: 'http://bifrost.test',
    path: '/api/providers',
    init: { method: 'GET', signal: extra.signal },
    timeoutMs: extra.timeoutMs,
  });

describe('bifrostFetch timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('aborts a request that gets no response', async () => {
    stubFetch('no-response');

    await expect(request({ timeoutMs: SHORT_LIMIT_MS })).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  test('aborts the read of a body that stops after the headers', async () => {
    stubFetch({ status: 200, stalledBody: '{"providers":[' });
    const response = await request({ timeoutMs: SHORT_LIMIT_MS });
    expect(response.status).toBe(200);

    await expect(response.json()).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  test('also aborts the body read through assertBifrostResponse for an error response', async () => {
    stubFetch({ status: 500, stalledBody: 'partial' });

    await expect(
      assertBifrostResponse(request({ timeoutMs: SHORT_LIMIT_MS })),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  test('uses 30 seconds when the caller sets no limit', async () => {
    stubFetch({ status: 200, stalledBody: '{}' });
    const timeout = vi.spyOn(AbortSignal, 'timeout');

    await request();

    expect(BIFROST_REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(timeout).toHaveBeenCalledWith(30_000);
  });

  test('a caller signal still aborts', async () => {
    stubFetch('no-response');
    const controller = new AbortController();
    const result = request({ timeoutMs: 10 * 60_000, signal: controller.signal });

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('lets a fast response through', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{"ok":true}'))),
    );

    const response = await request({ timeoutMs: 30_000 });

    expect(await response.json()).toEqual({ ok: true });
  });
});
