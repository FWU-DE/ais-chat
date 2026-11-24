export type Phase = 'idle' | 'syncing' | 'rolling_back' | 'restarting' | 'failed';

export type SyncError = { provider: string; step: string; message: string };

export type LastRun = {
  id: string;
  startedAt?: string;
  finishedAt: string;
  result: 'ok' | 'rolled_back' | 'failed';
  errors: SyncError[];
  rollbackErrors: SyncError[];
  note?: string;
};

export type RunInfo = {
  id: string;
  startedAt: string;
  step: string;
  /** Pod that receives all admin calls of this run. */
  writerUid?: string;
  contentHash?: string;
  /** UIDs of all pods at rollout start. The rollout is done when none of them exists anymore. */
  oldUids?: string[];
};

export type State = {
  phase: Phase;
  run?: RunInfo;
  lastRun?: LastRun;
  lastSyncedHash?: string;
  lastSuccessAt?: string;
  /**
   * Only this pod may write in the next run. Set when the other pods may hold different key IDs
   * or an older config (after a rollback that recreated keys, a failed rollback, a crash).
   */
  lastWriterUid?: string;
};

export type Instance = {
  /** Pod UID. A replacement always has a new one. */
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

export type PodState = 'pending' | 'evicted' | 'ready';

/** What `GET /v1/status` returns. Mapped explicitly from `State`, internal UIDs stay inside. */
export type StatusDto = {
  phase: Phase;
  run?: { id: string; startedAt: string; step: string; pods?: { name: string; state: PodState }[] };
  lastRun?: LastRun;
  lastSyncedHash?: string;
  /** The pod the next sync must use is missing or not Ready. `POST /v1/restart-all` resolves it. */
  writerUnavailable?: boolean;
};
