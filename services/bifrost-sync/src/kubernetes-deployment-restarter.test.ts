import { describe, expect, test } from 'vitest';

import {
  type Deployment,
  isRolloutComplete,
  KubernetesDeploymentRestarter,
} from './kubernetes-deployment-restarter';
import { fakeKube, type KubeCall } from './test/fake-kube';

const DEPLOYMENT_PATH = '/apis/apps/v1/namespaces/bifrost/deployments/bifrost';
const ANNOTATION = 'kubectl.kubernetes.io/restartedAt';

const deployment = (
  status: NonNullable<Deployment['status']>,
  overrides: { replicas?: number; generation?: number; annotation?: string } = {},
): Deployment => ({
  metadata: { generation: overrides.generation ?? 2 },
  spec: {
    replicas: overrides.replicas ?? 2,
    template: {
      metadata: {
        annotations: overrides.annotation ? { [ANNOTATION]: overrides.annotation } : {},
      },
    },
  },
  status: { observedGeneration: 2, ...status },
});

const restarter = (respond: (call: KubeCall) => { status: number; json: unknown }, pollMs = 1) => {
  const kube = fakeKube(respond);
  return {
    ...kube,
    restarter: new KubernetesDeploymentRestarter(kube.request, {
      namespace: 'bifrost',
      deployment: 'bifrost',
      selector: 'app.kubernetes.io/name=bifrost',
      port: 8080,
      pollMs,
    }),
  };
};

describe('isRolloutComplete', () => {
  test('is complete when all replicas are updated, the old ones are gone and all are available', () => {
    expect(
      isRolloutComplete(deployment({ replicas: 2, updatedReplicas: 2, availableReplicas: 2 })),
    ).toBe(true);
  });

  test('is not complete while an old pod still counts (updated == ready == spec, replicas above)', () => {
    // Measured: after about 33 s `updatedReplicas=2 readyReplicas=2` holds with `replicas=3`.
    expect(
      isRolloutComplete(
        deployment({
          replicas: 3,
          updatedReplicas: 2,
          availableReplicas: 2,
          readyReplicas: 2,
        } as never),
      ),
    ).toBe(false);
  });

  test('is not complete while the controller has not seen the new generation', () => {
    expect(
      isRolloutComplete(
        deployment(
          { observedGeneration: 1, replicas: 2, updatedReplicas: 2, availableReplicas: 2 },
          { generation: 2 },
        ),
      ),
    ).toBe(false);
  });

  test('is not complete while not all replicas are updated', () => {
    expect(
      isRolloutComplete(deployment({ replicas: 2, updatedReplicas: 1, availableReplicas: 2 })),
    ).toBe(false);
  });

  test('is not complete while an updated pod is not available', () => {
    expect(
      isRolloutComplete(deployment({ replicas: 2, updatedReplicas: 2, availableReplicas: 1 })),
    ).toBe(false);
  });

  test('is not complete for a Deployment without status', () => {
    expect(isRolloutComplete({ metadata: { generation: 1 }, spec: { replicas: 2 } })).toBe(false);
  });
});

describe('KubernetesDeploymentRestarter.restart', () => {
  test('patches restartedAt into the pod template with a strategic merge patch', async () => {
    const { restarter: r, calls } = restarter((call) =>
      call.method === 'GET' ? { status: 200, json: deployment({}) } : { status: 200, json: {} },
    );

    await r.restart('2026-11-25T08:00:00Z');

    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe(DEPLOYMENT_PATH);
    expect(patch.contentType).toBe('application/strategic-merge-patch+json');
    expect(patch.body).toEqual({
      spec: { template: { metadata: { annotations: { [ANNOTATION]: '2026-11-25T08:00:00Z' } } } },
    });
  });

  test('does not patch again when the annotation already has this value', async () => {
    const { restarter: r, calls } = restarter(() => ({
      status: 200,
      json: deployment({}, { annotation: '2026-11-25T08:00:00Z' }),
    }));

    await r.restart('2026-11-25T08:00:00Z');

    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  test('a failed patch is a KubeError', async () => {
    const { restarter: r } = restarter((call) =>
      call.method === 'GET' ? { status: 200, json: deployment({}) } : { status: 403, json: {} },
    );

    await expect(r.restart('t')).rejects.toMatchObject({ name: 'KubeError', status: 403 });
  });
});

describe('KubernetesDeploymentRestarter.waitForRollout', () => {
  test('keeps polling while the old pods are still counted and resolves when they are gone', async () => {
    const states = [
      deployment({ replicas: 3, updatedReplicas: 1, availableReplicas: 2 }),
      deployment({ replicas: 3, updatedReplicas: 2, availableReplicas: 2 }),
      deployment({ replicas: 2, updatedReplicas: 2, availableReplicas: 2 }),
    ];
    let polls = 0;
    const { restarter: r } = restarter(() => ({
      status: 200,
      json: states[Math.min(polls++, states.length - 1)],
    }));

    await r.waitForRollout(1000);

    expect(polls).toBe(3);
  });

  test('rejects after the timeout', async () => {
    const { restarter: r } = restarter(() => ({
      status: 200,
      json: deployment({ replicas: 3, updatedReplicas: 2, availableReplicas: 2 }),
    }));

    await expect(r.waitForRollout(20)).rejects.toThrow('rollout not complete');
  });
});

describe('KubernetesDeploymentRestarter pods', () => {
  const pod = (
    name: string,
    extra: object = {},
    conditions = [{ type: 'Ready', status: 'True' }],
  ) => ({
    metadata: { uid: `uid-${name}`, name, ...extra },
    status: { phase: 'Running', podIP: '10.0.0.1', conditions },
  });

  test('lists pods with IP, readiness and terminating state, sorted by name', async () => {
    const { restarter: r, calls } = restarter(() => ({
      status: 200,
      json: {
        items: [
          pod('b'),
          pod('a', {}, [{ type: 'Ready', status: 'False' }]),
          pod('c', { deletionTimestamp: '2026-11-25T08:00:00Z' }),
          { ...pod('d'), status: { phase: 'Failed' } },
          {
            ...pod('v6'),
            status: {
              phase: 'Running',
              podIP: 'fd00::1',
              conditions: [{ type: 'Ready', status: 'True' }],
            },
          },
        ],
      },
    }));

    const instances = await r.listInstances();

    expect(calls[0]!.path).toBe(
      '/api/v1/namespaces/bifrost/pods?labelSelector=app.kubernetes.io%2Fname%3Dbifrost',
    );
    expect(instances.map((i) => [i.name, i.ready, i.terminating])).toEqual([
      ['a', false, false],
      ['b', true, false],
      ['c', false, true],
      ['v6', true, false],
    ]);
    expect(instances[1]!.baseUrl).toBe('http://10.0.0.1:8080');
    expect(instances[3]!.baseUrl).toBe('http://[fd00::1]:8080');
  });

  test('reads the desired replicas from the Deployment', async () => {
    const { restarter: r } = restarter(() => ({
      status: 200,
      json: deployment({}, { replicas: 3 }),
    }));
    expect(await r.desiredReplicas()).toBe(3);
  });

  test('a failed read is a KubeError', async () => {
    const { restarter: r } = restarter(() => ({ status: 500, json: {} }));
    await expect(r.listInstances()).rejects.toMatchObject({ name: 'KubeError', status: 500 });
  });
});
