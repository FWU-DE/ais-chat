import { KubeError, type KubeRequest } from './kube-client';
import { type Restarter, sleep } from './restarter';
import type { Instance } from './types';

/*
 * RBAC the service needs, in the namespace of the Bifrost Deployment:
 *   pods         get, list
 *   deployments  get, patch   (only the Bifrost Deployment, via resourceNames)
 *   configmaps   get, update  (only the state ConfigMap, via resourceNames)
 * The service does not evict pods, so it needs no `pods/eviction`.
 */

const RESTARTED_AT = 'kubectl.kubernetes.io/restartedAt';

type Pod = {
  metadata: { uid: string; name: string; deletionTimestamp?: string };
  status?: {
    phase?: string;
    podIP?: string;
    conditions?: { type: string; status: string }[];
  };
};

export type Deployment = {
  metadata: { generation?: number };
  spec: {
    replicas?: number;
    template?: { metadata?: { annotations?: Record<string, string> } };
  };
  status?: {
    observedGeneration?: number;
    replicas?: number;
    updatedReplicas?: number;
    availableReplicas?: number;
  };
};

/**
 * The checks of `kubectl rollout status`. `readyReplicas` is not enough: it counts the old pods,
 * so `updatedReplicas == readyReplicas == spec.replicas` holds while the last new pod is not
 * Ready yet. `status.replicas` only drops to `spec.replicas` once the old pods are gone.
 */
export function isRolloutComplete(deployment: Deployment): boolean {
  const wanted = deployment.spec.replicas ?? 1;
  const status = deployment.status ?? {};
  const updated = status.updatedReplicas ?? 0;
  return (
    (status.observedGeneration ?? 0) >= (deployment.metadata.generation ?? 0) &&
    updated === wanted &&
    (status.replicas ?? 0) === updated &&
    (status.availableReplicas ?? 0) === updated
  );
}

export type DeploymentRestarterOptions = {
  namespace: string;
  deployment: string;
  /** Label selector of the Bifrost pods. */
  selector: string;
  port: number;
  pollMs?: number;
};

/** Restarts Bifrost with a rolling update: Kubernetes sets the pace, the service only patches and waits. */
export class KubernetesDeploymentRestarter implements Restarter {
  private readonly pollMs: number;

  constructor(
    private readonly request: KubeRequest,
    private readonly options: DeploymentRestarterOptions,
  ) {
    this.pollMs = options.pollMs ?? 2000;
  }

  private get deploymentPath() {
    return `/apis/apps/v1/namespaces/${this.options.namespace}/deployments/${this.options.deployment}`;
  }

  private async getDeployment(): Promise<Deployment> {
    const { status, json } = await this.request('GET', this.deploymentPath);
    if (status !== 200) throw new KubeError(status, 'GET', this.deploymentPath);
    return json as Deployment;
  }

  async listInstances(): Promise<Instance[]> {
    const path = `/api/v1/namespaces/${this.options.namespace}/pods?labelSelector=${encodeURIComponent(this.options.selector)}`;
    const { status, json } = await this.request('GET', path);
    if (status !== 200) throw new KubeError(status, 'GET', path);
    return ((json as { items?: Pod[] }).items ?? [])
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

  async rolloutComplete(): Promise<boolean> {
    return isRolloutComplete(await this.getDeployment());
  }

  async desiredReplicas(): Promise<number> {
    return (await this.getDeployment()).spec.replicas ?? 1;
  }

  async restart(restartedAt: string): Promise<void> {
    const current = (await this.getDeployment()).spec.template?.metadata?.annotations?.[
      RESTARTED_AT
    ];
    if (current === restartedAt) return;
    const { status } = await this.request(
      'PATCH',
      this.deploymentPath,
      { spec: { template: { metadata: { annotations: { [RESTARTED_AT]: restartedAt } } } } },
      'application/strategic-merge-patch+json',
    );
    if (status !== 200) throw new KubeError(status, 'PATCH', this.deploymentPath);
  }

  async waitForRollout(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (isRolloutComplete(await this.getDeployment())) return;
      if (Date.now() > deadline) throw new Error(`rollout not complete after ${timeoutMs} ms`);
      await sleep(this.pollMs);
    }
  }
}
