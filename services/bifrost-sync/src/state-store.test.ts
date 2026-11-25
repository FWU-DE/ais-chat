import { describe, expect, test } from 'vitest';

import { KubeError } from './kube-client';
import { ConfigMapStateStore, LockError } from './state-store';
import { fakeKube } from './test/fake-kube';

const PATH = '/api/v1/namespaces/bifrost/configmaps/bifrost-sync-state';

describe('ConfigMapStateStore', () => {
  test('reads the state and the resourceVersion', async () => {
    const stored = { phase: 'failed', lastSyncedHash: 'h' };
    const { request, calls } = fakeKube(() => ({
      status: 200,
      json: { metadata: { resourceVersion: '41' }, data: { state: JSON.stringify(stored) } },
    }));

    const { state, version } = await new ConfigMapStateStore(
      request,
      'bifrost',
      'bifrost-sync-state',
    ).read();

    expect(state).toEqual(stored);
    expect(version).toBe('41');
    expect(calls).toEqual([{ method: 'GET', path: PATH, body: undefined, contentType: undefined }]);
  });

  test('an empty ConfigMap is the idle state', async () => {
    const { request } = fakeKube(() => ({
      status: 200,
      json: { metadata: { resourceVersion: '1' } },
    }));

    const { state } = await new ConfigMapStateStore(
      request,
      'bifrost',
      'bifrost-sync-state',
    ).read();

    expect(state).toEqual({ phase: 'idle' });
  });

  test('writes with the resourceVersion it read and returns the new one', async () => {
    const { request, calls } = fakeKube(() => ({
      status: 200,
      json: { metadata: { resourceVersion: '42' } },
    }));
    const store = new ConfigMapStateStore(request, 'bifrost', 'bifrost-sync-state');

    const version = await store.write({ phase: 'syncing' }, '41');

    expect(version).toBe('42');
    expect(calls[0]).toMatchObject({ method: 'PUT', path: PATH });
    expect(calls[0]!.body).toMatchObject({
      kind: 'ConfigMap',
      metadata: { name: 'bifrost-sync-state', namespace: 'bifrost', resourceVersion: '41' },
      data: { state: JSON.stringify({ phase: 'syncing' }) },
    });
  });

  test('a 409 on the resourceVersion is a LockError', async () => {
    const { request } = fakeKube(() => ({ status: 409, json: {} }));

    await expect(
      new ConfigMapStateStore(request, 'bifrost', 'bifrost-sync-state').write(
        { phase: 'syncing' },
        '1',
      ),
    ).rejects.toBeInstanceOf(LockError);
  });

  test('other failures are KubeErrors with the status', async () => {
    const { request } = fakeKube(() => ({ status: 403, json: {} }));
    const store = new ConfigMapStateStore(request, 'bifrost', 'bifrost-sync-state');

    await expect(store.read()).rejects.toMatchObject({ name: 'KubeError', status: 403 });
    await expect(store.write({ phase: 'idle' }, '1')).rejects.toBeInstanceOf(KubeError);
  });
});
