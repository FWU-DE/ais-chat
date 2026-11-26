import { randomUUID } from 'node:crypto';

import { type BifrostTarget, providersHealthy, syncAll } from './bifrost-sync-core';
import { KubeError } from './kube-client';
import { type Restarter, sleep } from './restarter';
import type { SyncRequest } from './schemas';
import { LockError, type StateStore } from './state-store';
import {
  ConflictError,
  type Instance,
  type LastRun,
  type RunInfo,
  type RunOutcome,
  type State,
  type StatusDto,
  type SyncError,
} from './types';
import { verifyState } from './verify';

export type Logger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
};

export type OrchestratorOptions = {
  adminUsername: string;
  adminPassword: string;
  /** Time the rolling update may take before the run ends `failed`. */
  rolloutTimeoutMs: number;
  /**
   * The state could not be saved, so the persisted phase no longer matches the process. The
   * process has to exit: the next start runs `recover()` from the persisted state.
   */
  onFatal: (error: unknown) => void;
  /** Wait between two attempts to patch the Deployment. */
  restartRetryDelayMs: number;
  /** Clock of the service. Tests replace it. */
  now?: () => Date;
};

/** Attempts to patch the Deployment before the run ends `failed`. */
const RESTART_ATTEMPTS = 3;

type StatePatch = Partial<Omit<State, 'run'>> & {
  /** Starts a run. `step` is set here, like for every other change of the run. */
  newRun?: Pick<RunInfo, 'id' | 'startedAt' | 'contentHash'>;
  runPatch?: Partial<Pick<RunInfo, 'restartedAt' | 'outcome'>>;
  step?: string;
};

/** The persisted state of one run. Every save is an optimistic-lock write and the only place that sets `run.step`. */
class RunState {
  constructor(
    private readonly store: StateStore,
    public state: State,
    private version: string,
  ) {}

  async save(patch: StatePatch): Promise<void> {
    const { newRun, runPatch, step, ...rest } = patch;
    const current = this.state.run;
    let run: RunInfo | undefined = current;
    if (newRun) run = { ...newRun, step: step ?? 'sync' };
    else if (current) run = { ...current, ...runPatch, step: step ?? current.step };
    const next: State = { ...this.state, ...rest, run };
    this.version = await this.store.write(next, this.version);
    this.state = next;
  }

  get runId(): string {
    return this.state.run!.id;
  }
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'unknown error');

/** A patch can fail for a moment (API server busy or unreachable). A 403 or 404 will not pass by retrying. */
function isTransient(error: unknown): boolean {
  return !(error instanceof KubeError) || error.status === 429 || error.status >= 500;
}

const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

export class Orchestrator {
  private current?: Promise<void>;

  constructor(
    private readonly restarter: Restarter,
    private readonly store: StateStore,
    private readonly options: OrchestratorOptions,
    private readonly log: Logger,
  ) {}

  private now(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  /** Resolves when the background run ends. For tests and graceful shutdown. */
  whenIdle(): Promise<void> {
    return this.current ?? Promise.resolve();
  }

  async status(): Promise<StatusDto> {
    const { state } = await this.store.read();
    const dto: StatusDto = { phase: state.phase };
    if (state.run) {
      dto.run = { id: state.run.id, startedAt: state.run.startedAt, step: state.run.step };
    }
    if (state.lastRun) dto.lastRun = state.lastRun;
    if (state.lastSyncedHash) dto.lastSyncedHash = state.lastSyncedHash;
    return dto;
  }

  /** For `/metrics`. */
  async readState(): Promise<State> {
    return (await this.store.read()).state;
  }

  /**
   * Runs before the port opens. `restarting` continues: the persisted `restartedAt` makes the
   * patch idempotent, so the service waits for the running rollout and patches only if the crash
   * came before the patch. `syncing` and `rolling_back` leave an unknown DB state, so all pods
   * restart and the run ends `failed`.
   */
  async recover(): Promise<void> {
    const { state, version } = await this.store.read();
    this.log.info({ phase: state.phase, runId: state.run?.id }, 'recover');
    const run = new RunState(this.store, state, version);

    // The rollout runs in the background: it takes minutes, and the probes of this service must
    // pass meanwhile. `POST /v1/syncs` answers 409 while the phase is `restarting`.
    if (state.phase === 'restarting') {
      this.current = this.rollout(run).catch((e: unknown) => this.fatal(run, e));
    } else if (state.phase === 'syncing' || state.phase === 'rolling_back') {
      const outcome: RunOutcome = {
        result: 'failed',
        errors: [],
        rollbackErrors: [],
        note: `service restarted during ${state.phase}; state unknown`,
      };
      const at = this.now();
      await run.save({
        phase: 'restarting',
        step: 'rollout',
        lastWriteAt: at,
        runPatch: { restartedAt: at, outcome },
      });
      this.current = this.rollout(run).catch((e: unknown) => this.fatal(run, e));
    }
  }

  private fatal(run: RunState, error: unknown): void {
    this.log.error(
      { runId: run.runId, error: errorText(error) },
      'state could not be saved, exiting so that recover() can finish the run',
    );
    this.options.onFatal(error);
  }

  /** Steps 1 to 3. Throws `ConflictError` (409), otherwise the run continues in the background. */
  async start(request: SyncRequest): Promise<{ runId: string }> {
    const { state, version } = await this.store.read();
    if (state.phase !== 'idle' && state.phase !== 'failed') {
      throw new ConflictError(`run in progress (phase=${state.phase})`, { runId: state.run?.id });
    }

    // After a restart that hung or a patch that failed, an old pod can still be Ready and be the
    // first pod. It holds the old key IDs, and a sync on it would delete keys. A complete rollout
    // is the proof that every pod loaded the current DB state, readiness is not.
    if (!(await this.restarter.rolloutComplete())) {
      throw new ConflictError('a rollout is not complete; all pods must run the current template', {
        runId: state.run?.id,
      });
    }
    const [instances, wanted] = await Promise.all([
      this.restarter.listInstances(),
      this.restarter.desiredReplicas(),
    ]);
    const notReady = instances.filter((i) => !i.ready);
    if (notReady.length > 0 || instances.length !== wanted) {
      throw new ConflictError('not all bifrost pods are ready', {
        desiredReplicas: wanted,
        pods: instances.map((i) => ({ name: i.name, ready: i.ready, terminating: i.terminating })),
      });
    }
    // A pod that started before the last write holds old key IDs, and a sync through it would
    // delete keys. After a rejected patch or a hung rollout the old pods are still Ready, so
    // readiness proves nothing. Pods that Kubernetes created after the last write are safe, so
    // a restart by hand (or a rollout by someone else) lifts the block without a call to the service.
    // `creationTimestamp` has second resolution, so both sides are compared in whole seconds.
    const lastWriteAt = state.lastWriteAt;
    const stale = lastWriteAt
      ? instances.filter((i) => !(seconds(i.createdAt) >= seconds(lastWriteAt)))
      : [];
    if (stale.length > 0) {
      throw new ConflictError(
        'bifrost pods started before the last write; restart them (for example `kubectl rollout restart`)',
        { stalePods: stale.map((i) => i.name), lastWriteAt },
      );
    }

    // A Deployment scaled to zero passes both checks above. Without a pod there is no writer, and
    // the state would be saved as `syncing` for a run that never starts.
    const writer = instances[0];
    if (!writer) {
      throw new ConflictError('there is no bifrost pod to write through', {
        desiredReplicas: wanted,
      });
    }

    const runId = randomUUID();
    const run = new RunState(this.store, state, version);
    try {
      await run.save({
        phase: 'syncing',
        step: 'sync',
        newRun: {
          id: runId,
          startedAt: this.now(),
          contentHash: request.contentHash,
        },
      });
    } catch (e) {
      if (e instanceof LockError) {
        throw new ConflictError('run in progress (lock lost)', { runId: state.run?.id });
      }
      // The PUT may have committed although the call failed (lost response, timeout). The state
      // would then say `syncing` for a run that never started, and every request would get 409.
      // Exit, so that the next process runs `recover()` on whatever was saved.
      this.log.error(
        { runId, error: errorText(e) },
        'state could not be saved, exiting so that recover() can finish the run',
      );
      this.options.onFatal(e);
      throw e;
    }
    this.log.info({ runId, writer: writer.name, pods: instances.length }, 'sync started');
    this.current = this.execute(run, request, writer).catch((e: unknown) => this.abort(run, e));
    return { runId };
  }

  private target(pod: Instance): BifrostTarget {
    return {
      baseUrl: pod.baseUrl,
      username: this.options.adminUsername,
      password: this.options.adminPassword,
    };
  }

  /** Unexpected error inside a run. Pods may hold different states, so all of them restart. */
  private async abort(run: RunState, error: unknown): Promise<void> {
    this.log.error({ runId: run.runId, error: errorText(error) }, 'run failed unexpectedly');
    // The phase is already `restarting`, so the rollout started and only its last write failed.
    // A new patch would restart all pods a second time. `recover()` finishes the run.
    if (run.state.phase === 'restarting') return this.fatal(run, error);
    try {
      const at = this.now();
      await run.save({
        phase: 'restarting',
        step: 'rollout',
        lastWriteAt: at,
        runPatch: {
          restartedAt: at,
          outcome: {
            result: 'failed',
            errors: [],
            rollbackErrors: [],
            note: `unexpected error: ${errorText(error)}`,
          },
        },
      });
      await this.rollout(run);
    } catch (e) {
      this.fatal(run, e);
    }
  }

  private async execute(run: RunState, request: SyncRequest, writer: Instance): Promise<void> {
    const started = Date.now();
    const target = this.target(writer);

    let errors = await syncAll(target, request.providers);
    if (errors.length === 0) errors = await verifyState(target, request.providers);
    this.log.info(
      { runId: run.runId, errors: errors.length, ms: Date.now() - started },
      'sync done',
    );

    let outcome: RunOutcome = { result: 'ok', errors: [], rollbackErrors: [] };
    if (errors.length > 0) {
      await run.save({ phase: 'rolling_back', step: 'rollback' });
      const rollbackErrors = await this.rollback(target, request.baseline.providers);
      this.log.info({ runId: run.runId, errors: rollbackErrors.length }, 'rollback done');
      outcome = {
        result: rollbackErrors.length === 0 ? 'rolled_back' : 'failed',
        errors,
        rollbackErrors,
      };
    }

    // The writes are over. A pod created before this moment holds a state from before or during
    // them, and every pod the rollout creates comes after it.
    const at = this.now();
    await run.save({
      phase: 'restarting',
      step: 'rollout',
      lastWriteAt: at,
      runPatch: { restartedAt: at, outcome },
    });
    await this.rollout(run);
  }

  /**
   * Writes the baseline on the same pod, then reads it back. The read back is what shows a
   * rollback that cannot succeed: Bifrost does not let a provider lose its custom config.
   */
  private async rollback(
    target: BifrostTarget,
    baseline: SyncRequest['baseline']['providers'],
  ): Promise<SyncError[]> {
    const errors = await syncAll(target, baseline);
    return errors.length > 0 ? errors : verifyState(target, baseline);
  }

  /**
   * Steps 6 to 8. Patches the Deployment and waits for Kubernetes to finish the rolling update,
   * then checks every pod. The run always ends here, also after a rollback.
   */
  private async rollout(run: RunState): Promise<void> {
    const runId = run.runId;
    const { restartedAt, outcome } = run.state.run!;
    const started = Date.now();
    const base: RunOutcome = outcome ?? { result: 'failed', errors: [], rollbackErrors: [] };

    try {
      await this.restartWithRetry(restartedAt!, runId);
      await this.restarter.waitForRollout(this.options.rolloutTimeoutMs);
    } catch (e) {
      await this.finish(run, {
        ...base,
        result: 'failed',
        note: `rollout: ${errorText(e)}`,
      });
      return;
    }

    const checkErrors = await this.checkPods();
    this.log.info(
      { runId, ms: Date.now() - started, podErrors: checkErrors.length },
      'rollout done',
    );
    if (checkErrors.length > 0) {
      await this.finish(run, {
        ...base,
        result: 'failed',
        errors: [...base.errors, ...checkErrors],
      });
      return;
    }
    await this.finish(run, base);
  }

  /** Patching is idempotent for one `restartedAt`, so a retry after a lost response is safe. */
  private async restartWithRetry(restartedAt: string, runId: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.restarter.restart(restartedAt);
        return;
      } catch (e) {
        if (attempt >= RESTART_ATTEMPTS || !isTransient(e)) throw e;
        this.log.error({ runId, attempt, error: errorText(e) }, 'restart patch failed, retrying');
        await sleep(this.options.restartRetryDelayMs);
      }
    }
  }

  /** `GET /api/providers` on every pod. A pod without a working encryption key stays Ready but answers 500. */
  private async checkPods(): Promise<SyncError[]> {
    let pods: Instance[];
    try {
      pods = await this.restarter.listInstances();
    } catch (e) {
      return [{ provider: '*', step: 'pod-check', message: `cannot list pods: ${errorText(e)}` }];
    }
    const errors: SyncError[] = [];
    // `waitForRollout` returns as soon as the Deployment no longer counts the last old pod, which
    // is then still listed as Terminating (measured in kind: for up to the grace period). Its
    // port may already be closed, and it is not a pod of the new rollout.
    for (const pod of pods.filter((p) => !p.terminating)) {
      const healthy = pod.baseUrl !== '' && (await providersHealthy(this.target(pod)));
      if (!healthy) {
        errors.push({
          provider: '*',
          step: 'pod-check',
          message: `pod ${pod.name}: GET /api/providers failed`,
        });
      }
    }
    return errors;
  }

  private async finish(run: RunState, outcome: RunOutcome): Promise<void> {
    const failed = outcome.result === 'failed';
    if (failed) {
      this.log.error(
        {
          runId: run.runId,
          errors: outcome.errors.map(({ provider, step }) => ({ provider, step })),
          rollbackErrors: outcome.rollbackErrors.map(({ provider, step }) => ({ provider, step })),
          note: outcome.note,
        },
        'run failed',
      );
    }
    const lastRun: LastRun = {
      id: run.runId,
      startedAt: run.state.run?.startedAt,
      finishedAt: this.now(),
      result: outcome.result,
      errors: outcome.errors,
      rollbackErrors: outcome.rollbackErrors,
      ...(outcome.note ? { note: outcome.note } : {}),
    };
    const hash = run.state.run?.contentHash;
    await run.save({
      phase: failed ? 'failed' : 'idle',
      lastRun,
      ...(outcome.result === 'ok' && hash
        ? { lastSyncedHash: hash, lastSuccessAt: this.now() }
        : {}),
    });
  }
}
