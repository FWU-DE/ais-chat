import { describe, expect, it } from 'vitest';
import { WorkerPool } from './pool.js';
import type { Limits, Result } from './types.js';

const limits: Limits = {
  maxExpressionLength: 10,
  maxBodyBytes: 10,
  maxOutputBytes: 10,
  wallTimeMs: 10,
  concurrency: 1,
  maxQueuedRequests: 0,
};

describe('worker pool', () => {
  async function waitForStarted(started: string[], count: number): Promise<void> {
    while (started.length < count) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  it('rejects work when the queue is full', async () => {
    const pool = new WorkerPool(limits, async () => new Promise(() => undefined));
    const first = pool.run('1');
    expect((await pool.run('2')).status).toBe('overload');
    first.catch(() => undefined);
  });

  it('rejects work immediately when concurrency is non-positive', async () => {
    const pool = new WorkerPool(
      { ...limits, concurrency: 0, maxQueuedRequests: 2 },
      async () => new Promise(() => undefined),
    );

    await expect(pool.run('1')).resolves.toEqual({
      status: 'overload',
      error: 'worker pool is busy',
    });
  });

  it('runs queued work in FIFO order with bounded active concurrency', async () => {
    const queuedLimits = { ...limits, concurrency: 2, maxQueuedRequests: 3 };
    const started: string[] = [];
    let active = 0;
    let maximumActive = 0;
    const pool = new WorkerPool(queuedLimits, (expression) => {
      started.push(expression);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      return new Promise<Result>((resolve) => {
        setTimeout(() => {
          active -= 1;
          resolve({ status: 'success', result: expression });
        }, 1);
      });
    });

    const first = pool.run('1');
    const second = pool.run('2');
    const third = pool.run('3');
    const fourth = pool.run('4');
    const fifth = pool.run('5');
    expect(await pool.run('6')).toEqual({ status: 'overload', error: 'worker pool is busy' });
    await waitForStarted(started, 2);
    expect(started).toEqual(['1', '2']);
    await Promise.all([first, second, third, fourth, fifth]);
    expect(started).toEqual(['1', '2', '3', '4', '5']);
    expect(maximumActive).toBe(2);
  }, 10000);

  it('cancels queued work without starting it and recovers the slot', async () => {
    let releaseFirst: (result: Result) => void = () => undefined;
    const started: string[] = [];
    let invocation = 0;
    const pool = new WorkerPool({ ...limits, maxQueuedRequests: 2 }, (expression) => {
      started.push(expression);
      invocation += 1;
      if (invocation > 1) {
        return Promise.resolve({ status: 'success', result: expression });
      }

      return new Promise<Result>((resolve) => {
        releaseFirst = resolve;
      });
    });
    const first = pool.run('1');
    const controller = new AbortController();
    const cancelled = pool.run('2', { signal: controller.signal });
    controller.abort();
    expect(await cancelled).toEqual({ status: 'upstream_failure', error: 'request cancelled' });
    releaseFirst({ status: 'success', result: '1' });
    expect(await first).toEqual({ status: 'success', result: '1' });
    expect(started).toEqual(['1']);
    expect(await pool.run('3')).toEqual({ status: 'success', result: '3' });
  });

  it('returns a structured internal failure and releases a crashed slot', async () => {
    const failing = new WorkerPool(limits, async () => {
      throw new Error('crash');
    });
    expect((await failing.run('1')).status).toBe('internal_failure');
    expect((await failing.run('2')).status).toBe('internal_failure');
  });
});
