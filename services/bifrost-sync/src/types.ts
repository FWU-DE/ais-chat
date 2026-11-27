export type Phase = 'idle' | 'syncing' | 'rolling_back' | 'restarting' | 'failed';

export type RunResult = 'ok' | 'rolled_back' | 'failed';

export type SyncError = { provider: string; step: string; message: string };

export type LastRun = {
  id: string;
  startedAt?: string;
  finishedAt: string;
  result: RunResult;
  errors: SyncError[];
  rollbackErrors: SyncError[];
  note?: string;
};

/** How the run ends once the rollout and the pod check succeed. Persisted, so a restart can finish the run. */
export type RunOutcome = {
  result: RunResult;
  errors: SyncError[];
  rollbackErrors: SyncError[];
  note?: string;
};

export type RunInfo = {
  id: string;
  startedAt: string;
  step: string;
  contentHash?: string;
  /** Value of the `restartedAt` annotation of this run. Patching it again with the same value changes nothing. */
  restartedAt?: string;
  outcome?: RunOutcome;
};

export type State = {
  phase: Phase;
  run?: RunInfo;
  lastRun?: LastRun;
  lastSyncedHash?: string;
  lastSuccessAt?: string;
  /**
   * UIDs of the pods that existed when the service last wrote to Bifrost, or may have (taken
   * before the rollout, and after a crash). Such a pod holds the state from before the writes and
   * the old key IDs, and a sync through it would delete keys. A run starts only if none of them
   * exists anymore. The UID is exact: no clock and no timestamp with a resolution of seconds.
   */
  podsAtLastWrite?: string[];
};

export type Instance = {
  id: string;
  name: string;
  baseUrl: string;
  ready: boolean;
  terminating: boolean;
};

export class ConflictError extends Error {
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ConflictError';
    this.details = details;
  }
}

/** What `GET /v1/status` returns. Mapped explicitly from `State`. */
export type StatusDto = {
  phase: Phase;
  run?: { id: string; startedAt: string; step: string };
  lastRun?: LastRun;
  lastSyncedHash?: string;
};
