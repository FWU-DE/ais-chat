import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { type KubeConfig, KubeError, kubeRequest } from './kube-client';
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
    private readonly config: KubeConfig,
    private readonly name: string,
  ) {}

  private get path() {
    return `/api/v1/namespaces/${this.config.namespace}/configmaps/${this.name}`;
  }

  async read(): Promise<Versioned> {
    const { status, json } = await kubeRequest(this.config, 'GET', this.path);
    if (status !== 200) throw new KubeError(status, 'GET', this.path);
    const configMap = json as ConfigMap;
    const raw = configMap.data?.state;
    return {
      state: raw ? (JSON.parse(raw) as State) : { phase: 'idle' },
      version: configMap.metadata.resourceVersion,
    };
  }

  async write(state: State, version: string): Promise<string> {
    const { status, json } = await kubeRequest(this.config, 'PUT', this.path, {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: this.name,
        namespace: this.config.namespace,
        resourceVersion: version,
      },
      data: { state: JSON.stringify(state) },
    });
    if (status === 409) throw new LockError();
    if (status !== 200) throw new KubeError(status, 'PUT', this.path);
    return (json as ConfigMap).metadata.resourceVersion;
  }
}

/** State in a file, for the single-process local setup. Writes are atomic (temp file plus rename). */
export class FileStateStore implements StateStore {
  private version = 0;

  constructor(private readonly path: string) {}

  async read(): Promise<Versioned> {
    try {
      const state = JSON.parse(await readFile(this.path, 'utf8')) as State;
      return { state, version: String(this.version) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { state: { phase: 'idle' }, version: String(this.version) };
      }
      throw error;
    }
  }

  async write(state: State, version: string): Promise<string> {
    if (version !== String(this.version)) throw new LockError();
    this.version++;
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
    await rename(tmp, this.path);
    return String(this.version);
  }
}
