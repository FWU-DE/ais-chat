import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createHarness, type Harness, SECRET, syncRequest } from './test/harness';

let h: Harness;

const failWritesOn =
  (provider: string) => (r: { method: string; body?: Record<string, unknown> }) =>
    r.method === 'POST' && r.body?.provider === provider;

const indexOfEvent = (events: string[], event: string) => events.indexOf(event);

describe('successful run', () => {
  beforeEach(async () => {
    h = await createHarness();
    h.seedBaseline();
  });
  afterEach(() => h.close());

  test('syncs on one pod, restarts all pods one after another and sets lastSyncedHash', async () => {
    const response = await h.post(syncRequest());
    expect(response.statusCode).toBe(202);
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('idle');
    expect(status.lastRun?.result).toBe('ok');
    expect(status.lastSyncedHash).toBe('hash-target');

    const writes = h.cluster.requests.filter((r) => r.method !== 'GET');
    expect(new Set(writes.map((r) => r.pod))).toEqual(new Set(['bifrost-a']));
    const evictions = h.cluster.events.filter((e) => e.startsWith('evict'));
    expect(evictions).toEqual(['evict bifrost-a', 'evict bifrost-b']);
    // Both pods are replaced and hold the new state.
    for (const name of ['bifrost-c', 'bifrost-d']) {
      const pod = h.cluster.podByName(name);
      expect([...pod.memory.providers.keys()].sort()).toEqual(['pa', 'pb', 'pd']);
      expect(pod.memory.providers.get('pa')!.keys[0]!.value).toBe(SECRET.a2);
    }
  });

  test('checks GET /api/providers on the new pod before the next eviction', async () => {
    await h.post(syncRequest());
    await h.runToEnd();

    const events = h.cluster.events;
    const evictA = indexOfEvent(events, 'evict bifrost-a');
    const evictB = indexOfEvent(events, 'evict bifrost-b');
    const checkC = events.indexOf('GET /api/providers bifrost-c', evictA);
    expect(checkC).toBeGreaterThan(evictA);
    expect(checkC).toBeLessThan(evictB);
  });

  test('keeps the order of evictions and retries after a refused eviction (429)', async () => {
    h.cluster.refuseNext = 3;
    await h.post(syncRequest());
    await h.runToEnd();

    const events = h.cluster.events.filter((e) => e.startsWith('evict') || e.startsWith('refused'));
    expect(events.slice(0, 4)).toEqual([
      'refused bifrost-a',
      'refused bifrost-a',
      'refused bifrost-a',
      'evict bifrost-a',
    ]);
    expect(events.at(-1)).toBe('evict bifrost-b');
    expect((await h.status()).lastRun?.result).toBe('ok');
    expect(h.orchestrator.counters.evictions429).toBe(3);
  });

  test('stops the rollout when a new pod answers GET /api/providers with 500', async () => {
    h.cluster.newPodHealthy = () => false;
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('failed');
    expect(status.lastRun?.result).toBe('failed');
    expect(status.lastRun?.note).toContain('fails GET /api/providers');
    expect(status.lastSyncedHash).toBeUndefined();
    expect(h.cluster.events).toContain('evict bifrost-a');
    expect(h.cluster.events).not.toContain('evict bifrost-b');
  });

  test('VERIFY_PROVIDERS=warn continues and notes the failing pod', async () => {
    await h.close();
    h = await createHarness({ verifyProviders: 'warn' });
    h.seedBaseline();
    h.cluster.newPodHealthy = (name) => name !== 'bifrost-c';
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('idle');
    expect(status.lastRun?.result).toBe('ok');
    expect(status.lastRun?.note).toContain('bifrost-c: GET /api/providers not ok');
  });

  test('VERIFY_PROVIDERS=off skips the check', async () => {
    await h.close();
    h = await createHarness({ verifyProviders: 'off' });
    h.seedBaseline();
    h.cluster.newPodHealthy = () => false;
    await h.post(syncRequest());
    await h.runToEnd();

    expect((await h.status()).lastRun?.result).toBe('ok');
    const rolloutChecks = h.cluster.events.filter((e) =>
      e.startsWith('GET /api/providers bifrost-c'),
    );
    expect(rolloutChecks).toHaveLength(0);
  });

  test('resumes a failed rollout with POST /v1/resume and finishes with ok', async () => {
    h.cluster.newPodHealthy = (name) => name !== 'bifrost-c';
    await h.post(syncRequest());
    await h.runToEnd();
    expect((await h.status()).phase).toBe('failed');

    h.cluster.newPodHealthy = () => true;
    // The failing pod gets replaced by an operator, as the status tells.
    h.cluster.podByName('bifrost-c').healthy = true;
    const resumed = await h.app.inject({ method: 'POST', url: '/v1/resume', headers: h.auth });
    expect(resumed.statusCode).toBe(202);
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('idle');
    expect(status.lastRun?.result).toBe('ok');
    expect(status.lastSyncedHash).toBe('hash-target');
    expect(h.cluster.events.filter((e) => e === 'evict bifrost-b')).toHaveLength(1);
  });

  test('refuses a sync while the rollout is unfinished', async () => {
    h.cluster.newPodHealthy = () => false;
    await h.post(syncRequest());
    await h.runToEnd();

    const response = await h.post(syncRequest());
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain('rollout unfinished');
  });

  test('resume without a failed rollout is a conflict', async () => {
    const response = await h.app.inject({ method: 'POST', url: '/v1/resume', headers: h.auth });
    expect(response.statusCode).toBe(409);
  });
});

describe('rollback', () => {
  beforeEach(async () => {
    h = await createHarness();
    h.seedBaseline();
  });
  afterEach(() => h.close());

  test('partial failure rolls back with clear text from the baseline and does not restart', async () => {
    h.cluster.faults = [failWritesOn('pd')];
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('idle');
    expect(status.lastRun?.result).toBe('rolled_back');
    expect(status.lastRun?.errors).toEqual([
      { provider: 'pd', step: 'provider', message: 'Bifrost responded with HTTP 500' },
    ]);
    expect(status.lastSyncedHash).toBeUndefined();
    expect(h.cluster.events.some((e) => e.startsWith('evict'))).toBe(false);

    // The DB is back at the baseline, including the deleted key with its original value.
    const db = h.cluster.db.providers;
    expect(db.get('pa')!.keys[0]!.value).toBe(SECRET.a1);
    expect(db.get('pb')!.keys.map((k) => [k.name, k.value])).toEqual(
      expect.arrayContaining([
        ['kb', SECRET.b1],
        ['kb2', SECRET.b2],
      ]),
    );
    expect(db.has('pd')).toBe(false);

    // Every key written during the run carries a clear text value, never a masked one.
    const writtenValues = h.cluster.requests
      .filter((r) => (r.method === 'POST' || r.method === 'PUT') && r.path.includes('/keys'))
      .map((r) => (r.body as { value: unknown }).value);
    expect(writtenValues.length).toBeGreaterThan(0);
    for (const value of writtenValues) expect(String(value)).not.toContain('*');
    const rollbackWrites = h.cluster.requests.filter(
      (r) => r.method === 'POST' && r.path === '/api/providers/pb/keys',
    );
    expect(rollbackWrites.map((r) => (r.body as { value: string }).value)).toContain(SECRET.b2);
  });

  test('binds the next run to the rollback pod after keys were deleted and recreated', async () => {
    h.cluster.faults = [failWritesOn('pd')];
    await h.post(syncRequest());
    await h.runToEnd();
    expect((await h.status()).lastRun?.result).toBe('rolled_back');
    expect(h.store.state.lastWriterUid).toBe(h.cluster.uidOf('bifrost-a'));

    h.cluster.faults = [];
    h.cluster.requests.length = 0;
    const second = await h.post(syncRequest());
    expect(second.statusCode).toBe(202);
    await h.runToEnd();

    const firstWrites = h.cluster.requests.filter((r) => r.method !== 'GET');
    expect(firstWrites[0]!.pod).toBe('bifrost-a');
    expect(
      new Set(firstWrites.filter((r) => !r.path.includes('/restart')).map((r) => r.pod)),
    ).toEqual(new Set(['bifrost-a']));
    const status = await h.status();
    expect(status.lastRun?.result).toBe('ok');
    expect(h.store.state.lastWriterUid).toBeUndefined();
  });

  test('without deletions the next run is not bound', async () => {
    const providers = syncRequest().providers.filter((p) => p.provider !== 'pb');
    h.cluster.faults = [failWritesOn('pd')];
    await h.post(
      syncRequest({
        providers: [
          ...providers,
          { provider: 'pb', keys: syncRequest().baseline.providers[1]!.keys },
        ],
      }),
    );
    await h.runToEnd();

    expect((await h.status()).lastRun?.result).toBe('rolled_back');
    expect(h.store.state.lastWriterUid).toBeUndefined();
  });

  test('answers 409 with writerUnavailable when the bound pod is gone, and restart-all clears it', async () => {
    h.cluster.faults = [failWritesOn('pd')];
    await h.post(syncRequest());
    await h.runToEnd();
    h.cluster.faults = [];
    // The bound pod is evicted from outside (node drain). Its replacement is a different pod.
    const boundUid = h.cluster.uidOf('bifrost-a');
    await h.cluster.restart(boundUid);
    await h.cluster.waitUntilAllReady([boundUid], 5000);

    const blocked = await h.post(syncRequest());
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().writerUnavailable).toBe(true);
    expect((await h.status()).writerUnavailable).toBe(true);

    const restart = await h.app.inject({ method: 'POST', url: '/v1/restart-all', headers: h.auth });
    expect(restart.statusCode).toBe(202);
    await h.runToEnd();

    expect(h.store.state.lastWriterUid).toBeUndefined();
    const status = await h.status();
    expect(status.phase).toBe('idle');
    expect(status.writerUnavailable).toBeUndefined();
    // restart-all keeps the hash of the last real sync.
    expect(status.lastSyncedHash).toBeUndefined();
  });

  test('retries the rollback once on the replacement pod and succeeds', async () => {
    h.cluster.faults = [(r) => r.pod === 'bifrost-a' && r.method !== 'GET'];
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('idle');
    expect(status.lastRun?.result).toBe('rolled_back');
    expect(status.lastRun?.note).toContain('replacement pod (attempt 2)');
    expect(h.cluster.events).toContain('evict bifrost-a');
    expect(h.cluster.db.providers.get('pa')!.keys[0]!.value).toBe(SECRET.a1);
    // The replacement is the only writer that is allowed next.
    expect(h.store.state.lastWriterUid).toBeDefined();
    expect(h.store.state.lastWriterUid).not.toBe(h.cluster.uidOf('bifrost-b'));
  });

  test('fails when the rollback also fails on the replacement and binds to the replacement', async () => {
    h.cluster.faults = [(r) => r.method !== 'GET'];
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('failed');
    expect(status.lastRun?.result).toBe('failed');
    expect(status.lastRun?.rollbackErrors.length).toBeGreaterThan(0);
    expect(h.orchestrator.counters.rollbackFailures).toBe(1);
    const replacementUid = h.cluster.uidOf('bifrost-c');
    expect(h.store.state.lastWriterUid).toBe(replacementUid);
    expect(h.cluster.events.filter((e) => e.startsWith('evict'))).toEqual(['evict bifrost-a']);
  });

  test('after failed the next run goes to the replacement and can succeed', async () => {
    h.cluster.faults = [(r) => r.method !== 'GET'];
    await h.post(syncRequest());
    await h.runToEnd();
    h.cluster.faults = [];
    h.cluster.requests.length = 0;

    const response = await h.post(syncRequest({ baseline: syncRequest().baseline }));
    expect(response.statusCode).toBe(202);
    await h.runToEnd();

    const firstWrite = h.cluster.requests.find((r) => r.method !== 'GET');
    expect(firstWrite?.pod).toBe('bifrost-c');
    expect((await h.status()).lastRun?.result).toBe('ok');
  });

  test('error details in status never contain request data', async () => {
    h.cluster.faults = [failWritesOn('pd')];
    await h.post(syncRequest());
    await h.runToEnd();

    const text = JSON.stringify(await h.status());
    for (const secret of Object.values(SECRET)) expect(text).not.toContain(secret);
    expect(text).not.toContain('boom');
  });
});

describe('locking and preconditions', () => {
  beforeEach(async () => {
    h = await createHarness();
    h.seedBaseline();
  });
  afterEach(() => h.close());

  test('answers 409 with the running runId while a run is in progress', async () => {
    const first = await h.post(syncRequest());
    const second = await h.post(syncRequest());

    expect(second.statusCode).toBe(409);
    expect(second.json().runId).toBe(first.json().runId);
    await h.runToEnd();
  });

  test('lets exactly one of several parallel starts through', async () => {
    const responses = await Promise.all(Array.from({ length: 6 }, () => h.post(syncRequest())));
    expect(responses.filter((r) => r.statusCode === 202)).toHaveLength(1);
    expect(responses.filter((r) => r.statusCode === 409)).toHaveLength(5);
    await h.runToEnd();
  });

  test('answers 409 while a pod is not ready', async () => {
    h.cluster.newPodHealthy = () => true;
    await h.cluster.restart(h.cluster.uidOf('bifrost-a'));

    const response = await h.post(syncRequest());
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain('not all bifrost pods are ready');
  });

  test('answers 409 when fewer pods exist than expected', async () => {
    h.cluster.removeWithoutReplacement('bifrost-b');
    const response = await h.post(syncRequest());
    expect(response.statusCode).toBe(409);
  });
});

describe('crash recovery', () => {
  beforeEach(async () => {
    h = await createHarness();
    h.seedBaseline();
  });
  afterEach(() => h.close());

  test.each(['syncing', 'rolling_back'] as const)(
    'marks %s as failed and binds to the writer',
    async (phase) => {
      h.store.state = {
        phase,
        run: {
          id: 'run-1',
          startedAt: new Date().toISOString(),
          step: phase,
          writerUid: h.cluster.uidOf('bifrost-a'),
        },
      };
      await h.makeOrchestrator().recover();

      expect(h.store.state.phase).toBe('failed');
      expect(h.store.state.lastRun?.result).toBe('failed');
      expect(h.store.state.lastRun?.note).toContain(phase);
      expect(h.store.state.lastWriterUid).toBe(h.cluster.uidOf('bifrost-a'));
    },
  );

  test('a run after a crash in syncing uses the bound writer', async () => {
    h.store.state = {
      phase: 'syncing',
      run: {
        id: 'run-1',
        startedAt: new Date().toISOString(),
        step: 'sync',
        writerUid: h.cluster.uidOf('bifrost-b'),
      },
    };
    await h.makeOrchestrator().recover();
    await h.post(syncRequest());
    await h.runToEnd();

    const firstWrite = h.cluster.requests.find((r) => r.method !== 'GET');
    expect(firstWrite?.pod).toBe('bifrost-b');
  });

  test('continues a restarting run and evicts only pods that are still old', async () => {
    const oldUids = [h.cluster.uidOf('bifrost-a'), h.cluster.uidOf('bifrost-b')];
    await h.cluster.restart(oldUids[0]!);
    h.store.state = {
      phase: 'restarting',
      run: {
        id: 'run-1',
        startedAt: new Date().toISOString(),
        step: 'rollout',
        contentHash: 'hash-target',
        oldUids,
      },
    };
    const orchestrator = h.makeOrchestrator();
    await orchestrator.recover();
    await orchestrator.whenIdle();

    expect(h.cluster.events.filter((e) => e.startsWith('evict'))).toEqual([
      'evict bifrost-a',
      'evict bifrost-b',
    ]);
    expect(h.store.state.phase).toBe('idle');
    expect(h.store.state.lastRun?.result).toBe('ok');
    expect(h.store.state.lastSyncedHash).toBe('hash-target');
  });

  test('leaves idle and failed states untouched', async () => {
    h.store.state = { phase: 'idle', lastSyncedHash: 'x' };
    await h.makeOrchestrator().recover();
    expect(h.store.state).toEqual({ phase: 'idle', lastSyncedHash: 'x' });
  });
});

describe('logging', () => {
  beforeEach(async () => {
    h = await createHarness();
    h.seedBaseline();
  });
  afterEach(() => h.close());

  test('logs neither provider keys nor tokens nor the admin password', async () => {
    h.cluster.faults = [failWritesOn('pd')];
    await h.post(syncRequest());
    await h.runToEnd();
    h.cluster.faults = [(r) => r.method !== 'GET'];
    await h.post(syncRequest());
    await h.runToEnd();
    await h.app.inject({
      method: 'POST',
      url: '/v1/syncs',
      headers: h.auth,
      payload: '{"x": "sk-test-leak',
    });

    const output = JSON.stringify(h.logs);
    for (const secret of [
      ...Object.values(SECRET),
      'test-token-0123456789',
      'admin-test-password',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(h.logs.length).toBeGreaterThan(0);
  });
});
