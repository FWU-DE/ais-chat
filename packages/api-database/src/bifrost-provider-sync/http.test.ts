import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { BifrostProviderSyncError } from './error';
import { assertBifrostResponse, bifrostFetch } from './http';

describe('assertBifrostResponse', () => {
  test('throws a sync error that carries the HTTP status but not the response body', async () => {
    const response = new Response('{"error":"secret detail"}', { status: 409 });

    const error = await assertBifrostResponse(Promise.resolve(response)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BifrostProviderSyncError);
    expect((error as BifrostProviderSyncError).status).toBe(409);
    expect(JSON.stringify(error)).not.toContain('secret detail');
  });
});

describe('bifrostFetch timeout', () => {
  let server: Server;
  let url: string;
  const open = new Set<() => void>();

  beforeEach(async () => {
    server = createServer((req, res) => {
      if (req.url === '/silent') return; // never answers
      // Sends the headers and a first chunk, then stops.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"providers":[');
      open.add(() => res.end());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const release of open) release();
    open.clear();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('aborts a request that gets no response', async () => {
    const started = Date.now();

    await expect(
      bifrostFetch({
        bifrostAdminUrl: url,
        path: '/silent',
        init: { method: 'GET' },
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });

    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('aborts the read of a body that stops after the headers', async () => {
    const response = await bifrostFetch({
      bifrostAdminUrl: url,
      path: '/stalled-body',
      init: { method: 'GET' },
      timeoutMs: 150,
    });
    expect(response.status).toBe(200);

    await expect(response.json()).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  test('also aborts the body read through assertBifrostResponse for an error response', async () => {
    const failing = createServer((_req, res) => {
      res.writeHead(500);
      res.write('partial');
    });
    await new Promise<void>((resolve) => failing.listen(0, '127.0.0.1', resolve));
    const failingUrl = `http://127.0.0.1:${(failing.address() as AddressInfo).port}`;

    await expect(
      assertBifrostResponse(
        bifrostFetch({
          bifrostAdminUrl: failingUrl,
          path: '/',
          init: { method: 'GET' },
          timeoutMs: 150,
        }),
      ),
    ).rejects.toMatchObject({ name: 'TimeoutError' });

    failing.closeAllConnections();
    await new Promise<void>((resolve) => failing.close(() => resolve()));
  });

  test('a caller signal still aborts', async () => {
    const controller = new AbortController();
    const request = bifrostFetch({
      bifrostAdminUrl: url,
      path: '/silent',
      init: { method: 'GET', signal: controller.signal },
      timeoutMs: 10_000,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('lets a fast response through', async () => {
    const fast = createServer((_req, res) => res.end('{"ok":true}'));
    await new Promise<void>((resolve) => fast.listen(0, '127.0.0.1', resolve));
    const fastUrl = `http://127.0.0.1:${(fast.address() as AddressInfo).port}`;

    const response = await bifrostFetch({
      bifrostAdminUrl: fastUrl,
      path: '/',
      init: { method: 'GET' },
    });

    expect(await response.json()).toEqual({ ok: true });
    await new Promise<void>((resolve) => fast.close(() => resolve()));
  });
});
