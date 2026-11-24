import { type KubeConfig, KubeError, kubeRequest } from './kube-client';
import { type Restarter, RestartRefusedError, waitForInstances } from './restarter';
import type { Instance } from './types';

type Pod = {
  metadata: { uid: string; name: string; deletionTimestamp?: string };
  status?: {
    phase?: string;
    podIP?: string;
    conditions?: { type: string; status: string }[];
  };
};

export type KubernetesRestarterOptions = {
  selector: string;
  port: number;
  expectedReplicas: number;
  pollMs?: number;
};

/** Restarts pods through the Eviction API, so the PodDisruptionBudget decides the pace. */
export class KubernetesRestarter implements Restarter {
  private readonly pollMs: number;

  constructor(
    private readonly config: KubeConfig,
    private readonly options: KubernetesRestarterOptions,
  ) {
    this.pollMs = options.pollMs ?? 1000;
  }

  async listInstances(): Promise<Instance[]> {
    const path = `/api/v1/namespaces/${this.config.namespace}/pods?labelSelector=${encodeURIComponent(this.options.selector)}`;
    const { status, json } = await kubeRequest(this.config, 'GET', path);
    if (status !== 200) throw new KubeError(status, 'GET', path);
    return ((json as { items: Pod[] }).items ?? [])
      .filter((pod) => pod.status?.phase !== 'Failed' && pod.status?.phase !== 'Succeeded')
      .map((pod) => {
        const terminating = !!pod.metadata.deletionTimestamp;
        const ready =
          !terminating &&
          (pod.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');
        const ip = pod.status?.podIP;
        return {
          id: pod.metadata.uid,
          name: pod.metadata.name,
          baseUrl: ip ? `http://${ip.includes(':') ? `[${ip}]` : ip}:${this.options.port}` : '',
          ready,
          terminating,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The UID precondition makes sure a replacement with the same name is never evicted by accident. */
  async restart(id: string): Promise<void> {
    const pod = (await this.listInstances()).find((instance) => instance.id === id);
    if (!pod) return;
    const path = `/api/v1/namespaces/${this.config.namespace}/pods/${pod.name}/eviction`;
    const { status } = await kubeRequest(this.config, 'POST', path, {
      apiVersion: 'policy/v1',
      kind: 'Eviction',
      metadata: { name: pod.name, namespace: this.config.namespace },
      deleteOptions: { preconditions: { uid: id } },
    });
    if (status === 200 || status === 201 || status === 404 || status === 409) return;
    if (status === 429) throw new RestartRefusedError(pod.name);
    throw new KubeError(status, 'POST', path);
  }

  waitUntilAllReady(oldIds: string[], timeoutMs: number): Promise<void> {
    return waitForInstances(
      () => this.listInstances(),
      oldIds,
      this.options.expectedReplicas,
      timeoutMs,
      this.pollMs,
    );
  }
}
