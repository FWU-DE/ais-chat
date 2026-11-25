import { KubeError, type KubeRequest } from './kube-client';
import type { State } from './types';

export type Versioned = { state: State; version: string };

/** The state changed since it was read (optimistic lock). */
export class LockError extends Error {
  constructor() {
    super('state changed concurrently');
    this.name = 'LockError';
  }
}

export interface StateStore {
  read(): Promise<Versioned>;
  /** Writes against the version from `read`. Returns the new version, throws `LockError` on conflict. */
  write(state: State, version: string): Promise<string>;
}

type ConfigMap = { metadata: { resourceVersion: string }; data?: { state?: string } };

/** State in a ConfigMap. The `resourceVersion` is the optimistic lock: a PUT with an old one yields 409. */
export class ConfigMapStateStore implements StateStore {
  constructor(
    private readonly request: KubeRequest,
    private readonly namespace: string,
    private readonly name: string,
  ) {}

  private get path() {
    return `/api/v1/namespaces/${this.namespace}/configmaps/${this.name}`;
  }

  async read(): Promise<Versioned> {
    const { status, json } = await this.request('GET', this.path);
    if (status !== 200) throw new KubeError(status, 'GET', this.path);
    const configMap = json as ConfigMap;
    const raw = configMap.data?.state;
    return {
      state: raw ? (JSON.parse(raw) as State) : { phase: 'idle' },
      version: configMap.metadata.resourceVersion,
    };
  }

  async write(state: State, version: string): Promise<string> {
    const { status, json } = await this.request('PUT', this.path, {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: this.name, namespace: this.namespace, resourceVersion: version },
      data: { state: JSON.stringify(state) },
    });
    if (status === 409) throw new LockError();
    if (status !== 200) throw new KubeError(status, 'PUT', this.path);
    return (json as ConfigMap).metadata.resourceVersion;
  }
}
