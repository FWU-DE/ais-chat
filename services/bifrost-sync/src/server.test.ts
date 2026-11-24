import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { isValidToken } from './server';
import { createHarness, type Harness, SECRET, syncRequest, TOKEN } from './test/harness';

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
  h.seedBaseline();
});
afterEach(() => h.close());

describe('authentication', () => {
  test('rejects a request without token with 401', async () => {
    const response = await h.app.inject({ method: 'GET', url: '/v1/status' });
    expect(response.statusCode).toBe(401);
  });

  test('rejects a wrong token with 401, also for POST', async () => {
    const headers = { authorization: 'Bearer wrong-token-0123456789' };
    expect((await h.app.inject({ method: 'GET', url: '/v1/status', headers })).statusCode).toBe(
      401,
    );
    const post = await h.app.inject({
      method: 'POST',
      url: '/v1/syncs',
      headers,
      payload: syncRequest(),
    });
    expect(post.statusCode).toBe(401);
    expect((await h.status()).phase).toBe('idle');
  });

  test('rejects other schemes and prefixes of the token', async () => {
    for (const authorization of [
      TOKEN,
      `Basic ${TOKEN}`,
      `Bearer ${TOKEN.slice(0, -1)}`,
      `Bearer ${TOKEN}x`,
    ]) {
      const response = await h.app.inject({
        method: 'GET',
        url: '/v1/status',
        headers: { authorization },
      });
      expect(response.statusCode).toBe(401);
    }
  });

  test('protects metrics, resume and restart-all', async () => {
    for (const [method, url] of [
      ['GET', '/metrics'],
      ['POST', '/v1/resume'],
      ['POST', '/v1/restart-all'],
    ] as const) {
      expect((await h.app.inject({ method, url })).statusCode).toBe(401);
    }
  });

  test('serves /healthz without token', async () => {
    const response = await h.app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
  });

  test('isValidToken accepts only the exact token', () => {
    expect(isValidToken(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(isValidToken(undefined, TOKEN)).toBe(false);
    expect(isValidToken('Bearer ', TOKEN)).toBe(false);
  });
});

describe('POST /v1/syncs validation', () => {
  test('answers 422 for an empty provider list', async () => {
    const response = await h.post(syncRequest({ providers: [] }));
    expect(response.statusCode).toBe(422);
    expect((await h.status()).phase).toBe('idle');
  });

  test.each([
    [
      'missing contentHash',
      { providers: syncRequest().providers, baseline: syncRequest().baseline },
    ],
    ['missing baseline', { contentHash: 'h', providers: syncRequest().providers }],
    ['provider without keys', { ...syncRequest(), providers: [{ provider: 'pa' }] }],
    [
      'key without name',
      { ...syncRequest(), providers: [{ provider: 'pa', keys: [{ value: 'x' }] }] },
    ],
  ])('answers 422 for %s', async (_name, payload) => {
    const response = await h.post(payload);
    expect(response.statusCode).toBe(422);
  });

  test('does not echo request data in a validation error', async () => {
    const payload = syncRequest({
      providers: [
        { provider: 'pa', keys: [{ name: '', value: SECRET.a1, models: [], weight: 1 }] },
      ],
    });
    const response = await h.post(payload);
    expect(response.statusCode).toBe(422);
    expect(response.body).not.toContain(SECRET.a1);
  });

  test('answers 400 without echoing a malformed body', async () => {
    const response = await h.app.inject({
      method: 'POST',
      url: '/v1/syncs',
      headers: { ...h.auth, 'content-type': 'application/json' },
      payload: `{"providers": "${SECRET.a1}`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(SECRET.a1);
  });

  test('accepts a valid request with 202 and a runId', async () => {
    const response = await h.post(syncRequest());
    expect(response.statusCode).toBe(202);
    expect(response.json().runId).toEqual(expect.any(String));
    await h.runToEnd();
  });
});

describe('GET /v1/status and /metrics', () => {
  test('reports phase, run progress and the last run', async () => {
    expect((await h.status()).phase).toBe('idle');
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('idle');
    expect(status.lastRun?.result).toBe('ok');
    expect(status.lastSyncedHash).toBe('hash-target');
  });

  test('exposes phase, duration, last success and counters', async () => {
    await h.post(syncRequest());
    await h.runToEnd();
    const response = await h.app.inject({ method: 'GET', url: '/metrics', headers: h.auth });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('bifrost_sync_phase{phase="idle"} 1');
    expect(response.body).toContain('bifrost_sync_phase{phase="failed"} 0');
    expect(response.body).toContain('bifrost_sync_runs_total{result="ok"} 1');
    expect(response.body).toMatch(/bifrost_sync_last_success_timestamp_seconds \d+/);
    expect(response.body).toMatch(/bifrost_sync_run_duration_seconds [\d.]+/);
  });
});
