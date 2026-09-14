import { runCalculator, type SpawnCalculator } from './worker.js';
import type { Limits, Result, RunOptions } from './types.js';

export class WorkerPool {
  private active = 0;
  private readonly queue: QueueEntry[] = [];

  constructor(
    private readonly limits: Limits,
    private readonly runner = runCalculator,
    private readonly spawnCalculator?: SpawnCalculator,
  ) {}

  run(expression: string, options: RunOptions = {}): Promise<Result> {
    if (options.signal?.aborted) {
      return Promise.resolve({ status: 'upstream_failure', error: 'request cancelled' });
    }

    if (this.limits.concurrency <= 0) {
      return Promise.resolve({ status: 'overload', error: 'worker pool is busy' });
    }

    if (this.active < this.limits.concurrency) {
      return this.start(expression, options);
    }

    if (this.queue.length >= this.limits.maxQueuedRequests) {
      return Promise.resolve({ status: 'overload', error: 'worker pool is busy' });
    }

    return new Promise((resolve) => {
      const entry: QueueEntry = {
        expression,
        options,
        resolve,
        onAbort: () => undefined,
        settled: false,
      };
      const onAbort = () => {
        const index = this.queue.indexOf(entry);
        if (index === -1) {
          return;
        }

        this.queue.splice(index, 1);
        entry.settled = true;
        options.signal?.removeEventListener('abort', onAbort);
        resolve({ status: 'upstream_failure', error: 'request cancelled' });
      };
      entry.onAbort = onAbort;
      options.signal?.addEventListener('abort', onAbort, { once: true });
      this.queue.push(entry);
    });
  }

  private start(expression: string, options: RunOptions): Promise<Result> {
    this.active += 1;
    return Promise.resolve()
      .then(() => this.runner(expression, this.limits, this.spawnCalculator, options))
      .catch((): Result => ({ status: 'internal_failure', error: 'worker failed' }))
      .finally(() => {
        this.active -= 1;
        this.drain();
      });
  }

  private drain(): void {
    while (this.active < this.limits.concurrency && this.queue.length > 0) {
      const entry = this.queue.shift();
      if (!entry || entry.settled) {
        continue;
      }

      entry.settled = true;
      if (entry.onAbort) {
        entry.options.signal?.removeEventListener('abort', entry.onAbort);
      }

      if (entry.options.signal?.aborted) {
        entry.resolve({ status: 'upstream_failure', error: 'request cancelled' });
        continue;
      }

      void this.start(entry.expression, entry.options).then(entry.resolve);
    }
  }
}

type QueueEntry = {
  expression: string;
  options: RunOptions;
  resolve: (result: Result) => void;
  onAbort: () => void;
  settled: boolean;
};
