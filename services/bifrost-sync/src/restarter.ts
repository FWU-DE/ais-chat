import type { Instance } from './types';

export interface Restarter {
  /** The Bifrost pods, sorted by name. Terminating pods are listed with `ready: false`. */
  listInstances(): Promise<Instance[]>;
  /** Number of pods the Deployment wants. */
  desiredReplicas(): Promise<number>;
  /** Starts the rolling update. Does nothing if `restartedAt` is already set to this value. */
  restart(restartedAt: string): Promise<void>;
  /** Resolves when the rolling update is complete. Rejects after `timeoutMs`. */
  waitForRollout(timeoutMs: number): Promise<void>;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
