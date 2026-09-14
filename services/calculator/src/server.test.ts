import { request as httpRequest } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createCalculatorServer, createCalculatorServerWithPool } from './server.js';
import type { Result } from './types.js';

async function listen() {
  const server = createCalculatorServer();
  await server.listen({ port: 0, host: '127.0.0.1' });
  const address = server.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, port };
}

async function close(server: ReturnType<typeof createCalculatorServer>) {
  await server.close();
}

describe('HTTP interface', () => {
  it('serves health and validates calculate requests', async () => {
    const { server, port } = await listen();
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(health.status).toBe(200);
    const invalid = await fetch(`http://127.0.0.1:${port}/v1/calculate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(invalid.status).toBe(400);
    await close(server);
  });

  it('does not expose the misleading readiness endpoint', async () => {
    const { server, port } = await listen();
    const readiness = await fetch(`http://127.0.0.1:${port}/readyz`);

    expect(readiness.status).toBe(404);
    await close(server);
  });

  it('returns stable errors for malformed JSON and unknown routes', async () => {
    const { server, port } = await listen();
    const malformed = await fetch(`http://127.0.0.1:${port}/v1/calculate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      status: 'invalid_input',
      error: 'body must be an object',
    });

    const unknown = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(unknown.status).toBe(404);
    await close(server);
  });

  it('does not expose unexpected error messages', async () => {
    const server = createCalculatorServerWithPool(
      {
        maxExpressionLength: 100,
        maxBodyBytes: 1000,
        maxOutputBytes: 1000,
        wallTimeMs: 1000,
        concurrency: 1,
        maxQueuedRequests: 0,
      },
      {
        run: async () => {
          throw new Error('secret failure');
        },
      },
    );
    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/v1/calculate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expression: '1+1' }),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      status: 'internal_failure',
      error: 'internal failure',
    });
    await close(server);
  });

  it('returns structured 400 responses for content type and body size violations', async () => {
    const { server, port } = await listen();
    const contentType = await fetch(`http://127.0.0.1:${port}/v1/calculate`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'ignored',
    });
    expect(contentType.status).toBe(400);
    expect(await contentType.json()).toEqual({
      status: 'invalid_input',
      error: 'content-type must be application/json',
    });

    const oversized = await fetch(`http://127.0.0.1:${port}/v1/calculate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expression: 'x'.repeat(8193) }),
    });
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toEqual({ status: 'invalid_input', error: 'body too large' });
    await close(server);
  });

  it('drains oversized chunked bodies before responding', async () => {
    const { server, port } = await listen();
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const client = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: '/v1/calculate',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => (body += chunk));
          response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
        },
      );
      client.on('error', reject);
      client.write('{"expression":"');
      client.write('x'.repeat(9000));
      client.end('"}');
    });
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ status: 'invalid_input', error: 'body too large' });
    await close(server);
  });

  it('aborts qalc when the client disconnects after the request body completes', async () => {
    let signal: AbortSignal | undefined;
    let started: () => void = () => undefined;
    const calculatorStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pool = {
      run: (_expression: string, options: { signal?: AbortSignal }): Promise<Result> => {
        signal = options.signal;
        started();
        return new Promise(() => undefined);
      },
    };
    const server = createCalculatorServerWithPool(
      {
        maxExpressionLength: 100,
        maxBodyBytes: 1000,
        maxOutputBytes: 1000,
        wallTimeMs: 1000,
        concurrency: 1,
        maxQueuedRequests: 0,
      },
      pool,
    );
    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const client = httpRequest({
      host: '127.0.0.1',
      port,
      path: '/v1/calculate',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    client.on('error', () => undefined);
    client.end(JSON.stringify({ expression: '1+1' }));

    await calculatorStarted;
    expect(signal?.aborted).toBe(false);
    client.destroy();
    await new Promise<void>((resolve) => {
      const check = () => (signal?.aborted ? resolve() : setImmediate(check));
      check();
    });
    expect(signal?.aborted).toBe(true);
    await close(server);
  });
});
