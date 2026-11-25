import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { keyOf } from './test/fake-bifrost';
import { createHarness, type Harness, SECRET, syncRequest } from './test/harness';
import type { State } from './types';

let h: Harness;

const failWritesOn =
  (provider: string) => (r: { method: string; body?: Record<string, unknown> }) =>
    r.method === 'POST' && r.body?.provider === provider;

const writes = (cluster: Harness['cluster']) => cluster.requests.filter((r) => r.method !== 'GET');

beforeEach(async () => {
  h = await createHarness();
  h.seedBaseline();
});
afterEach(() => h.close());

describe('successful run', () => {
  test('syncs on one pod, restarts all pods through the Deployment and sets lastSyncedHash', async () => {
    const response = await h.post(syncRequest());
    expect(response.statusCode).toBe(202);
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('idle');
    expect(status.lastRun?.result).toBe('ok');
    expect(status.lastSyncedHash).toBe('hash-target');
    expect(new Set(writes(h.cluster).map((r) => r.pod))).toEqual(new Set(['bifrost-a']));
    expect(h.cluster.patches).toHaveLength(1);
    // All pods are new and hold the new state.
    for (const name of ['bifrost-c', 'bifrost-d']) {
      const pod = h.cluster.podByName(name);
      expect([...pod.memory.providers.keys()].sort()).toEqual(['pa', 'pb', 'pd']);
      expect(pod.memory.providers.get('pa')!.keys[0]!.value).toBe(SECRET.a2);
    }
  });

  test('checks GET /api/providers on every pod after the rollout', async () => {
    await h.post(syncRequest());
    await h.runToEnd();

    const events = h.cluster.events;
    const patch = events.indexOf('patch');
    for (const name of ['bifrost-c', 'bifrost-d']) {
      expect(events.indexOf(`GET /api/providers ${name}`, patch)).toBeGreaterThan(patch);
    }
  });

  test('the step is set only through the run state and follows the phases', async () => {
    const steps: (string | undefined)[] = [];
    const original = h.store.write.bind(h.store);
    h.store.write = (state, version) => {
      steps.push(`${state.phase}:${state.run?.step}`);
      return original(state, version);
    };
    await h.post(syncRequest());
    await h.runToEnd();

    expect(steps).toEqual(['syncing:sync', 'restarting:rollout', 'idle:rollout']);
  });

  test('the sync always writes on a Ready pod, never on a pod that is not Ready', async () => {
    h.cluster.setReady('bifrost-a', false);
    const response = await h.post(syncRequest());

    expect(response.statusCode).toBe(409);
    expect(writes(h.cluster)).toHaveLength(0);
  });
});

describe('read back after the sync', () => {
  test('a write that Bifrost stores differently counts as a sync error and rolls back', async () => {
    // Bifrost stores the target value of `ka` with another weight. The baseline value is stored as sent.
    h.cluster.quirks = {
      rewriteKey: (key) => (key.value === SECRET.a2 ? { ...key, weight: 7 } : key),
    };
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.lastRun?.result).toBe('rolled_back');
    expect(status.lastRun?.errors).toContainEqual({
      provider: 'pa',
      step: 'verify',
      message: 'key ka: weight differs',
    });
  });

  test('a rollback whose read back differs is a failed rollback', async () => {
    h.cluster.quirks = { rewriteKey: (key) => ({ ...key, weight: 7 }) };
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.lastRun?.result).toBe('failed');
    expect(status.lastRun?.rollbackErrors.length).toBeGreaterThan(0);
  });
});

describe('rollback', () => {
  test('partial failure rolls back with clear text from the baseline', async () => {
    h.cluster.faults = [failWritesOn('pd')];
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.lastRun?.result).toBe('rolled_back');
    expect(status.lastRun?.errors).toEqual([
      { provider: 'pd', step: 'provider', message: 'Bifrost responded with HTTP 500' },
    ]);
    expect(status.lastSyncedHash).toBeUndefined();

    const db = h.cluster.db.providers;
    expect(db.get('pa')!.keys[0]!.value).toBe(SECRET.a1);
    expect(db.get('pb')!.keys.map((k) => [k.name, k.value])).toEqual(
      expect.arrayContaining([
        ['kb', SECRET.b1],
        ['kb2', SECRET.b2],
      ]),
    );
    expect(db.has('pd')).toBe(false);

    const recreated = h.cluster.requests.filter(
      (r) => r.method === 'POST' && r.path === '/api/providers/pb/keys',
    );
    expect(recreated.map((r) => (r.body as { value: string }).value)).toContain(SECRET.b2);
    // Values are clear text, never a masked value copied from a GET response.
    const keyValues = writes(h.cluster)
      .filter((r) => r.path.includes('/keys') && r.method !== 'DELETE')
      .map((r) => (r.body as { value: string }).value);
    expect(keyValues.length).toBeGreaterThan(0);
    for (const value of keyValues) expect(value).not.toContain('*');
  });

  test('the rollout follows a successful rollback, and all pods load the DB state', async () => {
    h.cluster.faults = [failWritesOn('pd')];
    await h.post(syncRequest());
    await h.runToEnd();

    expect(h.cluster.patches).toHaveLength(1);
    expect((await h.status()).phase).toBe('idle');
    for (const name of ['bifrost-c', 'bifrost-d']) {
      const keys = h.cluster.podByName(name).memory.providers.get('pb')!.keys;
      expect(keys.map((k) => k.name).sort()).toEqual(['kb', 'kb2']);
    }
    // Both pods hold the same key IDs, so the next provider PUT works on either of them.
    const idsOf = (name: string) =>
      h.cluster
        .podByName(name)
        .memory.providers.get('pb')!
        .keys.map((k) => k.id)
        .sort();
    expect(idsOf('bifrost-c')).toEqual(idsOf('bifrost-d'));
  });

  test('a failed rollback ends failed, restarts all pods anyway and logs on error level', async () => {
    h.cluster.faults = [(r) => r.method !== 'GET'];
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('failed');
    expect(status.lastRun?.result).toBe('failed');
    expect(status.lastRun?.rollbackErrors.length).toBeGreaterThan(0);
    expect(h.cluster.patches).toHaveLength(1);
    const logged = h.logs.find((l) => l.level === 'error' && l.msg === 'run failed');
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged)).not.toContain('sk-test');
  });

  test('there is no second rollback attempt on a replacement pod', async () => {
    h.cluster.faults = [(r) => r.pod === 'bifrost-a' && r.method !== 'GET'];
    await h.post(syncRequest());
    await h.runToEnd();

    expect((await h.status()).lastRun?.result).toBe('failed');
    expect(new Set(writes(h.cluster).map((r) => r.pod))).toEqual(new Set(['bifrost-a']));
  });

  test('a new sync after failed may start on any Ready pod', async () => {
    h.cluster.faults = [(r) => r.method !== 'GET'];
    await h.post(syncRequest());
    await h.runToEnd();
    h.cluster.faults = [];
    h.cluster.requests.length = 0;

    const response = await h.post(syncRequest());

    expect(response.statusCode).toBe(202);
    await h.runToEnd();
    expect((await h.status()).lastRun?.result).toBe('ok');
  });

  test('error details in the status never contain request data', async () => {
    h.cluster.faults = [failWritesOn('pd')];
    await h.post(syncRequest());
    await h.runToEnd();

    const text = JSON.stringify(await h.status());
    for (const secret of Object.values(SECRET)) expect(text).not.toContain(secret);
    expect(text).not.toContain('boom');
  });
});

describe('check after the rollout', () => {
  test('a pod that answers GET /api/providers with 500 ends the run failed', async () => {
    h.cluster.newPodHealthy = (name) => name !== 'bifrost-d';
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('failed');
    expect(status.lastRun?.result).toBe('failed');
    expect(status.lastRun?.errors).toContainEqual({
      provider: '*',
      step: 'pod-check',
      message: 'pod bifrost-d: GET /api/providers failed',
    });
    expect(status.lastSyncedHash).toBeUndefined();
    const logged = h.logs.find((l) => l.level === 'error' && l.msg === 'run failed');
    expect(logged).toBeDefined();
  });

  test('a rollout that does not finish ends the run failed', async () => {
    h.cluster.rolloutStuck = true;
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.phase).toBe('failed');
    expect(status.lastRun?.note).toContain('rollout:');
  });

  test('the check also runs after a rollback and keeps the rollback result in the errors', async () => {
    h.cluster.faults = [failWritesOn('pd')];
    h.cluster.newPodHealthy = () => false;
    await h.post(syncRequest());
    await h.runToEnd();

    const status = await h.status();
    expect(status.lastRun?.result).toBe('failed');
    expect(status.lastRun?.errors.map((e) => e.step)).toEqual([
      'provider',
      'pod-check',
      'pod-check',
    ]);
  });
});

describe('locking and preconditions', () => {
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
    h.cluster.setReady('bifrost-b', false);
    const response = await h.post(syncRequest());

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain('not all bifrost pods are ready');
  });

  test('answers 409 when fewer pods exist than the Deployment wants', async () => {
    h.cluster.removePod('bifrost-b');
    expect((await h.post(syncRequest())).statusCode).toBe(409);
  });

  test('POST /v1/resume and POST /v1/restart-all do not exist', async () => {
    for (const url of ['/v1/resume', '/v1/restart-all']) {
      const response = await h.app.inject({ method: 'POST', url, headers: h.auth });
      expect(response.statusCode).toBe(404);
    }
  });
});

describe('crash recovery', () => {
  const run = (step: string, extra: Partial<NonNullable<State['run']>> = {}) => ({
    id: 'run-1',
    startedAt: new Date().toISOString(),
    step,
    contentHash: 'hash-target',
    ...extra,
  });

  test.each(['syncing', 'rolling_back'] as const)(
    '%s becomes failed and all pods restart',
    async (phase) => {
      h.store.state = { phase, run: run(phase) };
      const orchestrator = h.makeOrchestrator();

      await orchestrator.recover();
      await orchestrator.whenIdle();

      expect(h.store.state.phase).toBe('failed');
      expect(h.store.state.lastRun?.result).toBe('failed');
      expect(h.store.state.lastRun?.note).toContain(`restarted during ${phase}`);
      expect(h.store.state.lastSyncedHash).toBeUndefined();
      expect(h.cluster.patches).toHaveLength(1);
    },
  );

  test('restarting waits for the running rollout and does not patch again', async () => {
    const restartedAt = '2026-11-25T08:00:00.000Z';
    await h.cluster.restart(restartedAt);
    h.store.state = {
      phase: 'restarting',
      run: run('rollout', {
        restartedAt,
        outcome: { result: 'ok', errors: [], rollbackErrors: [] },
      }),
    };
    const orchestrator = h.makeOrchestrator();

    await orchestrator.recover();
    await orchestrator.whenIdle();

    expect(h.cluster.patches).toEqual([restartedAt]);
    expect(h.store.state.phase).toBe('idle');
    expect(h.store.state.lastRun?.result).toBe('ok');
    expect(h.store.state.lastSyncedHash).toBe('hash-target');
  });

  test('restarting before the patch patches once with the persisted value', async () => {
    const restartedAt = '2026-11-25T08:00:00.000Z';
    h.store.state = {
      phase: 'restarting',
      run: run('rollout', {
        restartedAt,
        outcome: { result: 'rolled_back', errors: [], rollbackErrors: [] },
      }),
    };
    const orchestrator = h.makeOrchestrator();

    await orchestrator.recover();
    await orchestrator.whenIdle();

    expect(h.cluster.patches).toEqual([restartedAt]);
    expect(h.store.state.lastRun?.result).toBe('rolled_back');
  });

  test('keeps the rollback result across a crash during the rollout', async () => {
    h.cluster.faults = [failWritesOn('pd')];
    const original = h.store.write.bind(h.store);
    let crashed = false;
    h.store.write = async (state, version) => {
      const written = await original(state, version);
      if (!crashed && state.phase === 'restarting') {
        crashed = true;
        throw new Error('process died');
      }
      return written;
    };
    await h.post(syncRequest());
    await h.runToEnd();
    expect(crashed).toBe(true);
    expect(h.store.state.phase).toBe('restarting');

    h.store.write = original;
    const orchestrator = h.makeOrchestrator();
    await orchestrator.recover();
    await orchestrator.whenIdle();

    expect(h.store.state.lastRun?.result).toBe('rolled_back');
    expect(h.store.state.lastRun?.errors[0]?.provider).toBe('pd');
  });

  test.each(['syncing', 'rolling_back'] as const)(
    'a state that cannot be saved while recovering %s makes recover() reject',
    async (phase) => {
      h.store.state = { phase, run: run(phase) };
      h.store.write = () => Promise.reject(new Error('etcd unavailable'));

      await expect(h.makeOrchestrator().recover()).rejects.toThrow('etcd unavailable');
      expect(h.cluster.patches).toHaveLength(0);
    },
  );

  test('a state that cannot be saved at the end of a recovered rollout exits the process', async () => {
    const restartedAt = '2026-11-25T08:00:00.000Z';
    h.store.state = {
      phase: 'restarting',
      run: run('rollout', {
        restartedAt,
        outcome: { result: 'ok', errors: [], rollbackErrors: [] },
      }),
    };
    h.store.write = () => Promise.reject(new Error('etcd unavailable'));
    const orchestrator = h.makeOrchestrator();

    await orchestrator.recover();
    await orchestrator.whenIdle();

    expect(h.fatalErrors).toHaveLength(1);
    expect(h.logs.some((l) => l.level === 'error' && l.msg.includes('exiting'))).toBe(true);
  });

  test('a state that cannot be saved at the end of a run exits and does not patch a second time', async () => {
    const original = h.store.write.bind(h.store);
    h.store.write = (state, version) =>
      state.phase === 'idle' || state.phase === 'failed'
        ? Promise.reject(new Error('etcd unavailable'))
        : original(state, version);

    await h.post(syncRequest());
    await h.runToEnd();

    expect(h.fatalErrors).toHaveLength(1);
    expect(h.cluster.patches).toHaveLength(1);
    expect(h.store.state.phase).toBe('restarting');
  });

  test('leaves idle and failed states untouched', async () => {
    h.store.state = { phase: 'idle', lastSyncedHash: 'x' };
    await h.makeOrchestrator().recover();
    expect(h.store.state).toEqual({ phase: 'idle', lastSyncedHash: 'x' });
    expect(h.cluster.patches).toHaveLength(0);
  });

  test('an unexpected error during the sync restarts all pods and ends failed', async () => {
    h.cluster.setReady('bifrost-a', true);
    const original = h.cluster.podByName('bifrost-a');
    await original.close();
    await h.post(syncRequest());
    await h.runToEnd();

    expect((await h.status()).lastRun?.result).toBe('failed');
    expect(h.cluster.patches).toHaveLength(1);
  });
});

describe('logging', () => {
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

  test('the sync keys of the test data are never real values', () => {
    expect(keyOf('k', SECRET.a1).value).toMatch(/^sk-test-/);
  });
});
