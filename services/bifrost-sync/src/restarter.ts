import type { Instance } from './types';

export interface Restarter {
  listInstances(): Promise<Instance[]>;
  /** Restarts the instance with this UID. Does nothing if it is gone or already replaced. */
  restart(id: string): Promise<void>;
  /** Resolves when none of `oldIds` exists anymore and all expected instances are Ready. */
  waitUntilAllReady(oldIds: string[], timeoutMs: number): Promise<void>;
}

/** The platform refuses the restart for now (Kubernetes: PDB, 429). The caller waits and retries. */
export class RestartRefusedError extends Error {
  constructor(name: string) {
    super(`restart of ${name} refused`);
    this.name = 'RestartRefusedError';
  }
}

export class RolloutTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RolloutTimeoutError';
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Shared by all restarters: polls until the old instances are gone and every expected one is Ready. */
export async function waitForInstances(
  list: () => Promise<Instance[]>,
  oldIds: string[],
  expectedReplicas: number,
  timeoutMs: number,
  pollMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const instances = await list();
    const noneOld = !instances.some((instance) => oldIds.includes(instance.id));
    if (noneOld && instances.length === expectedReplicas && instances.every((i) => i.ready)) {
      return;
    }
    if (Date.now() > deadline) {
      const summary = instances
        .map(
          (i) =>
            `${i.name}(${oldIds.includes(i.id) ? 'old' : 'new'},${i.ready ? 'ready' : 'notready'})`,
        )
        .join(' ');
      throw new RolloutTimeoutError(`timeout waiting for pods: ${summary}`);
    }
    await sleep(pollMs);
  }
}
