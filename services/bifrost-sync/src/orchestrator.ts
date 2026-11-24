import { randomUUID } from 'node:crypto';

import { type BifrostTarget, providersHealthy, syncAll } from './bifrost-sync-core';
import { type Restarter, RestartRefusedError, sleep } from './restarter';
import type { SyncRequest } from './schemas';
import { LockError, type StateStore, type Versioned } from './state-store';
import {
  ConflictError,
  type Instance,
  type LastRun,
  type PodState,
  type State,
  type StatusDto,
  type SyncError,
} from './types';

export type Logger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
};

export type OrchestratorOptions = {
  adminUsername: string;
  adminPassword: string;
  expectedReplicas: number;
  /** No progress (eviction accepted, pod Ready) within this time fails the rollout. */
  rolloutTimeoutMs: number;
  evictBackoffMs: number;
  pollMs?: number;
  /**
   * off: no check. warn: check `GET /api/providers` on every new pod and note failures.
   * fail: stop the rollout before the next eviction if a new pod answers with an error.
   */
  verifyProviders: 'off' | 'warn' | 'fail';
};

export type RunCounters = {
  runs: Record<LastRun['result'], number>;
  rollbackFailures: number;
  evictions429: number;
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'unknown error');

/** Mutable view of the persisted state of one run. Every save is an optimistic-lock write. */
class RunState {
  constructor(
    private readonly store: StateStore,
    public state: State,
    private version: string,
  ) {}

  async save(patch: Partial<State> & { step?: string }): Promise<void> {
    const { step, ...rest } = patch;
    const run = rest.run ?? this.state.run;
    this.state = { ...this.state, ...rest, run: run && step ? { ...run, step } : run };
    this.version = await this.store.write(this.state, this.version);
  }

  get runId(): string {
    return this.state.run!.id;
  }
}

export class Orchestrator {
  readonly counters: RunCounters = {
    runs: { ok: 0, rolled_back: 0, failed: 0 },
    rollbackFailures: 0,
    evictions429: 0,
  };
  private current?: Promise<void>;

  constructor(
    private readonly restarter: Restarter,
    private readonly store: StateStore,
    private readonly options: OrchestratorOptions,
    private readonly log: Logger,
  ) {}

  /** Resolves when the background run ends. For tests and graceful shutdown. */
  whenIdle(): Promise<void> {
    return this.current ?? Promise.resolve();
  }

  async status(): Promise<StatusDto> {
    const { state } = await this.store.read();
    let instances: Instance[] | undefined;
    try {
      instances = await this.restarter.listInstances();
    } catch {
      instances = undefined;
    }
    const dto: StatusDto = { phase: state.phase };
    if (state.run) {
      dto.run = {
        id: state.run.id,
        startedAt: state.run.startedAt,
        step: state.run.step,
        ...(instances && state.run.oldUids
          ? { pods: this.podStates(instances, state.run.oldUids) }
          : {}),
      };
    }
    if (state.lastRun) dto.lastRun = state.lastRun;
    if (state.lastSyncedHash) dto.lastSyncedHash = state.lastSyncedHash;
    if (instances && state.lastWriterUid) {
      const writer = instances.find((i) => i.id === state.lastWriterUid);
      if (!writer || !writer.ready) dto.writerUnavailable = true;
    }
    return dto;
  }

  /** Reads the state fresh, for `/metrics`. */
  readState(): Promise<Versioned> {
    return this.store.read();
  }

  private podStates(instances: Instance[], oldUids: string[]): { name: string; state: PodState }[] {
    return instances.map((i) => {
      const isOld = oldUids.includes(i.id);
      let state: PodState;
      if (isOld) state = i.terminating ? 'evicted' : 'pending';
      else state = i.ready ? 'ready' : 'evicted';
      return { name: i.name, state };
    });
  }

  /**
   * After a crash: `restarting` continues. `syncing` and `rolling_back` become `failed`, and the
   * next run is bound to the pod that did the writes, because the other pods may be stale.
   */
  async recover(): Promise<void> {
    const { state, version } = await this.store.read();
    this.log.info({ phase: state.phase, runId: state.run?.id }, 'recover');
    const run = new RunState(this.store, state, version);
    if (state.phase === 'restarting') {
      this.current = this.rollout(run).catch((e: unknown) =>
        this.log.error({ error: errorText(e) }, 'resume after restart failed'),
      );
    } else if (state.phase === 'syncing' || state.phase === 'rolling_back') {
      await run.save({
        phase: 'failed',
        lastWriterUid: state.run?.writerUid ?? state.lastWriterUid,
        lastRun: {
          id: state.run?.id ?? 'unknown',
          startedAt: state.run?.startedAt,
          finishedAt: new Date().toISOString(),
          result: 'failed',
          errors: [],
          rollbackErrors: [],
          note: `service restarted during ${state.phase}; state unknown`,
        },
      });
      this.counters.runs.failed++;
    }
  }

  /** Steps 1 to 3 of the flow. Throws `ConflictError` (409), otherwise the run continues in the background. */
  async start(request: SyncRequest): Promise<{ runId: string }> {
    const { state, version } = await this.store.read();
    this.assertIdleOrFailed(state);
    if (state.phase === 'failed' && state.run?.step === 'rollout') {
      throw new ConflictError('rollout unfinished; call POST /v1/resume or POST /v1/restart-all', {
        runId: state.run.id,
      });
    }

    const instances = await this.restarter.listInstances();
    const writer = this.chooseWriter(state, instances);
    const notReady = instances.filter((i) => !i.ready);
    if (notReady.length > 0 || instances.length !== this.options.expectedReplicas) {
      throw new ConflictError('not all bifrost pods are ready', {
        expectedReplicas: this.options.expectedReplicas,
        pods: instances.map((i) => ({ name: i.name, ready: i.ready, terminating: i.terminating })),
      });
    }

    const runId = randomUUID();
    const initial: State = {
      ...state,
      phase: 'syncing',
      run: {
        id: runId,
        startedAt: new Date().toISOString(),
        step: 'sync',
        writerUid: writer.id,
        contentHash: request.contentHash,
      },
    };
    const run = await this.lock(initial, version, state);
    this.log.info({ runId, writer: writer.name, pods: instances.length }, 'sync started');
    this.current = this.execute(run, request, writer).catch((e: unknown) =>
      this.abort(run, writer, e),
    );
    return { runId };
  }

  /** Restarts all pods, clears the writer binding. Does not touch `lastSyncedHash`. */
  async restartAll(): Promise<{ runId: string }> {
    const { state, version } = await this.store.read();
    this.assertIdleOrFailed(state);
    const instances = await this.restarter.listInstances();
    const runId = randomUUID();
    const initial: State = {
      ...state,
      phase: 'restarting',
      run: {
        id: runId,
        startedAt: new Date().toISOString(),
        step: 'rollout',
        oldUids: instances.map((i) => i.id),
      },
    };
    const run = await this.lock(initial, version, state);
    this.log.info({ runId, pods: instances.length }, 'restart-all started');
    this.current = this.rollout(run, 'restart-all').catch((e: unknown) =>
      this.log.error({ runId, error: errorText(e) }, 'restart-all failed'),
    );
    return { runId };
  }

  /** "Neustart fortsetzen": after a `failed` rollout. */
  async resume(): Promise<{ runId: string }> {
    const { state, version } = await this.store.read();
    if (state.phase !== 'failed' || state.run?.step !== 'rollout' || !state.run.oldUids) {
      throw new ConflictError('nothing to resume');
    }
    const run = new RunState(this.store, state, version);
    try {
      await run.save({ phase: 'restarting', step: 'rollout' });
    } catch (e) {
      if (e instanceof LockError) throw new ConflictError('run in progress (lock lost)');
      throw e;
    }
    this.current = this.rollout(run).catch((e: unknown) =>
      this.log.error({ runId: run.runId, error: errorText(e) }, 'resume failed'),
    );
    return { runId: run.runId };
  }

  private assertIdleOrFailed(state: State): void {
    if (state.phase !== 'idle' && state.phase !== 'failed') {
      throw new ConflictError(`run in progress (phase=${state.phase})`, { runId: state.run?.id });
    }
  }

  /** A bound writer must exist and be Ready, otherwise the stale pods could delete keys. */
  private chooseWriter(state: State, instances: Instance[]): Instance {
    if (state.lastWriterUid) {
      const bound = instances.find((i) => i.id === state.lastWriterUid);
      if (!bound || !bound.ready || bound.terminating) {
        throw new ConflictError(
          'bound writer pod is missing or not ready; call POST /v1/restart-all',
          {
            writerUnavailable: true,
          },
        );
      }
      return bound;
    }
    const writer = instances.find((i) => i.ready && !i.terminating);
    if (!writer) throw new ConflictError('no ready bifrost pod');
    return writer;
  }

  private async lock(initial: State, version: string, previous: State): Promise<RunState> {
    try {
      const newVersion = await this.store.write(initial, version);
      return new RunState(this.store, initial, newVersion);
    } catch (e) {
      if (e instanceof LockError) {
        throw new ConflictError('run in progress (lock lost)', { runId: previous.run?.id });
      }
      throw e;
    }
  }

  private target(pod: Instance): BifrostTarget {
    return {
      baseUrl: pod.baseUrl,
      username: this.options.adminUsername,
      password: this.options.adminPassword,
    };
  }

  /** Unexpected error inside a run. The writer holds the freshest state, so the next run binds to it. */
  private async abort(run: RunState, writer: Instance, error: unknown): Promise<void> {
    this.log.error({ runId: run.runId, error: errorText(error) }, 'run failed unexpectedly');
    try {
      await this.finish(run, 'failed', {
        phase: 'failed',
        lastWriterUid: writer.id,
        note: `unexpected error: ${errorText(error)}`,
      });
    } catch {
      // The state is not writable. `recover()` marks the run on the next start.
    }
  }

  private async finish(
    run: RunState,
    result: LastRun['result'],
    options: {
      phase: State['phase'];
      errors?: SyncError[];
      rollbackErrors?: SyncError[];
      note?: string;
    } & Partial<State>,
  ): Promise<void> {
    const { phase, errors, rollbackErrors, note, ...statePatch } = options;
    await run.save({
      ...statePatch,
      phase,
      lastRun: {
        id: run.runId,
        startedAt: run.state.run?.startedAt,
        finishedAt: new Date().toISOString(),
        result,
        errors: errors ?? [],
        rollbackErrors: rollbackErrors ?? [],
        ...(note ? { note } : {}),
      },
    });
    this.counters.runs[result]++;
  }

  private async execute(run: RunState, request: SyncRequest, writer: Instance): Promise<void> {
    const started = Date.now();
    const result = await syncAll(this.target(writer), request.providers);
    this.log.info(
      {
        runId: run.runId,
        errors: result.errors.length,
        deleted: result.deleted,
        ms: Date.now() - started,
      },
      'sync done',
    );

    if (result.errors.length === 0) {
      const all = await this.restarter.listInstances();
      await run.save({
        phase: 'restarting',
        step: 'rollout',
        run: { ...run.state.run!, step: 'rollout', oldUids: all.map((i) => i.id) },
      });
      await this.rollout(run);
      return;
    }

    await run.save({ phase: 'rolling_back', step: 'rollback' });
    await this.rollback(run, request, writer, result.errors, result.deleted);
  }

  /**
   * Rolls back to the baseline on the same pod, without restart. If that fails, the writer is
   * evicted and the rollback runs once more on the replacement (measured: the replacement loads
   * the DB state, so a stale pod memory as cause is gone).
   */
  private async rollback(
    run: RunState,
    request: SyncRequest,
    writer: Instance,
    errors: SyncError[],
    deleted: boolean,
  ): Promise<void> {
    const baseline = request.baseline.providers;
    let target = writer;
    let rollbackErrors: SyncError[] = [];

    for (let attempt = 1; attempt <= 2; attempt++) {
      const outcome = await syncAll(this.target(target), baseline);
      rollbackErrors = outcome.errors;
      this.log.info(
        { runId: run.runId, attempt, pod: target.name, errors: outcome.errors.length },
        'rollback',
      );
      if (outcome.errors.length === 0) {
        // Deleted keys come back with new IDs on this pod only. The other pods keep the old IDs
        // and would fail the next provider PUT, so the next run must use this pod. The same
        // holds after a replacement: an older binding points to the evicted pod.
        await this.finish(run, 'rolled_back', {
          phase: 'idle',
          errors,
          ...(deleted || attempt > 1 ? { lastWriterUid: target.id } : {}),
          ...(attempt > 1
            ? { note: `rollback succeeded on replacement pod (attempt ${attempt})` }
            : {}),
        });
        return;
      }
      if (attempt === 2) break;
      target = await this.replaceInstance(target);
      this.log.info({ runId: run.runId, pod: target.name }, 'writer replaced for rollback retry');
    }

    this.counters.rollbackFailures++;
    await this.finish(run, 'failed', {
      phase: 'failed',
      errors,
      rollbackErrors,
      lastWriterUid: target.id,
    });
  }

  /** Evicts a pod, waits for its replacement and returns it. */
  private async replaceInstance(pod: Instance): Promise<Instance> {
    const before = new Set((await this.restarter.listInstances()).map((i) => i.id));
    await this.restartWithBackoff(pod.id);
    await this.restarter.waitUntilAllReady([pod.id], this.options.rolloutTimeoutMs);
    const replacement = (await this.restarter.listInstances()).find((i) => !before.has(i.id));
    if (!replacement) throw new Error('replacement pod not found');
    return replacement;
  }

  private async restartWithBackoff(id: string): Promise<void> {
    const deadline = Date.now() + this.options.rolloutTimeoutMs;
    for (;;) {
      try {
        await this.restarter.restart(id);
        return;
      } catch (e) {
        if (!(e instanceof RestartRefusedError) || Date.now() > deadline) throw e;
        this.counters.evictions429++;
        await sleep(this.options.evictBackoffMs);
      }
    }
  }

  /**
   * Steps 6 to 8. Derives progress from the cluster (UIDs), not from a counter in the state.
   * Before every further eviction, all new pods must be Ready and, if configured, pass
   * `GET /api/providers`.
   */
  private async rollout(run: RunState, kind: 'sync' | 'restart-all' = 'sync'): Promise<void> {
    const runId = run.runId;
    const oldUids = run.state.run?.oldUids ?? [];
    const started = Date.now();
    const verified = new Set<string>();
    const warnings: string[] = [];
    let lastProgress = Date.now();

    try {
      for (;;) {
        const instances = await this.restarter.listInstances();
        const pending = instances.filter((i) => oldUids.includes(i.id) && !i.terminating);
        if (pending.length === 0) break;
        if (Date.now() - lastProgress > this.options.rolloutTimeoutMs) {
          throw new Error('rollout timeout: no progress');
        }

        const fresh = instances.filter((i) => !oldUids.includes(i.id));
        const replacementsMissing = pending.length < oldUids.length && fresh.length === 0;
        if (replacementsMissing || fresh.some((i) => !i.ready)) {
          await sleep(this.options.pollMs ?? 1000);
          continue;
        }
        if (this.options.verifyProviders !== 'off') {
          for (const pod of fresh.filter((i) => !verified.has(i.id))) {
            const healthy = await providersHealthy(this.target(pod));
            if (!healthy && this.options.verifyProviders === 'fail') {
              throw new Error(`new pod ${pod.name} fails GET /api/providers; rollout stopped`);
            }
            if (!healthy) warnings.push(`${pod.name}: GET /api/providers not ok`);
            verified.add(pod.id);
          }
        }

        const next = pending[0]!;
        try {
          await this.restarter.restart(next.id);
          lastProgress = Date.now();
          this.log.info({ runId, pod: next.name, sinceStartMs: Date.now() - started }, 'evict');
        } catch (e) {
          if (!(e instanceof RestartRefusedError)) throw e;
          this.counters.evictions429++;
          await sleep(this.options.evictBackoffMs);
        }
      }

      await this.restarter.waitUntilAllReady(oldUids, this.options.rolloutTimeoutMs);
      if (this.options.verifyProviders !== 'off') {
        for (const pod of await this.restarter.listInstances()) {
          if (verified.has(pod.id) || (await providersHealthy(this.target(pod)))) continue;
          if (this.options.verifyProviders === 'fail') {
            throw new Error(`new pod ${pod.name} fails GET /api/providers`);
          }
          warnings.push(`${pod.name}: GET /api/providers not ok`);
        }
      }
    } catch (e) {
      this.log.error({ runId, error: errorText(e) }, 'rollout failed');
      await this.finish(run, 'failed', {
        phase: 'failed',
        note: `rollout: ${errorText(e)}`,
      });
      return;
    }

    this.log.info({ runId, ms: Date.now() - started, warnings: warnings.length }, 'rollout done');
    const note = [
      kind === 'restart-all' ? 'restart-all' : '',
      ...warnings.map((w) => `warning: ${w}`),
    ]
      .filter(Boolean)
      .join('; ');
    const contentHash = run.state.run?.contentHash;
    await this.finish(run, 'ok', {
      phase: 'idle',
      lastWriterUid: undefined,
      ...(contentHash ? { lastSyncedHash: contentHash } : {}),
      lastSuccessAt: new Date().toISOString(),
      ...(note ? { note } : {}),
    });
  }
}
