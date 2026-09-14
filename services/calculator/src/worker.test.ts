import { describe, expect, it } from 'vitest';
import { runCalculator } from './worker.js';
import type { Limits } from './types.js';

const limits: Limits = {
  maxExpressionLength: 20,
  maxBodyBytes: 100,
  maxOutputBytes: 100,
  wallTimeMs: 100,
  concurrency: 1,
  maxQueuedRequests: 0,
};

function fakeRunner(
  result: Record<string, unknown>,
  calls?: { command: string; args: string[]; options: Record<string, unknown> },
) {
  return (async (command: string, args: readonly string[], options: Record<string, unknown>) => {
    if (calls) {
      calls.command = command;
      calls.args = [...args];
      calls.options = options;
    }
    return result;
  }) as never;
}

describe('qalc worker lifecycle', () => {
  it('does not spawn qalc for an already cancelled request', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runCalculator('1', limits, fakeRunner({}), { signal: controller.signal });

    expect(result).toEqual({
      status: 'upstream_failure',
      error: 'request cancelled',
    });
  });

  it('wins the cancellation race when the signal aborts immediately after spawn', async () => {
    const controller = new AbortController();
    controller.abort();
    const resultPromise = runCalculator('1', limits, fakeRunner({ isCanceled: true }), {
      signal: controller.signal,
    });

    await expect(resultPromise).resolves.toEqual({
      status: 'upstream_failure',
      error: 'request cancelled',
    });
  });

  it('reports a timeout when the process does not exit', async () => {
    const result = await runCalculator(
      '1',
      { ...limits, wallTimeMs: 5 },
      fakeRunner({ timedOut: true }),
    );
    expect(result.status).toBe('timeout');
  });

  it('passes the exact argv after the option terminator and never writes stdin', async () => {
    const calls = { command: '', args: [], options: {} } as {
      command: string;
      args: string[];
      options: Record<string, unknown>;
    };
    const result = await runCalculator(
      '-1 + 2',
      limits,
      fakeRunner({ exitCode: 0, stdout: Buffer.from('2'), isTerminated: false }, calls),
    );

    expect(calls.command).toBe('qalc');
    expect(calls.args).toEqual([
      '--terse',
      '-s',
      'approximation exact',
      '-s',
      'color false',
      '-s',
      'unicode false',
      '-s',
      'save mode no',
      '-s',
      'save definitions no',
      '-s',
      'update exchange rates 0',
      '--',
      '-1 + 2',
    ]);
    expect(calls.options).toMatchObject({
      encoding: 'buffer',
      extendEnv: false,
      shell: false,
      stderr: 'ignore',
      reject: false,
    });
    expect(result).toEqual({ status: 'success', result: '2' });
  });

  it('consumes stderr without changing a successful result', async () => {
    const result = await runCalculator(
      '1',
      limits,
      fakeRunner({ exitCode: 0, stdout: Buffer.from('1'), isTerminated: false }),
    );

    expect(result).toEqual({ status: 'success', result: '1' });
  });

  it('treats a nonzero exit as invalid input', async () => {
    const result = await runCalculator(
      '1',
      limits,
      fakeRunner({ exitCode: 1, stdout: '', isTerminated: false }),
    );

    expect(result.status).toBe('invalid_input');
  });

  it('gives oversized stdout precedence over oversized stderr', async () => {
    const result = await runCalculator('1', limits, fakeRunner({ isMaxBuffer: true }));

    expect(result).toEqual({ status: 'malformed_output', error: 'output too large' });
  });

  it('reports invalid input for a normal nonzero qalc exit', async () => {
    const result = await runCalculator(
      '1',
      limits,
      fakeRunner({ exitCode: 1, stdout: '', isTerminated: false }),
    );
    expect(result).toEqual({
      status: 'invalid_input',
      error: 'qalc could not evaluate the expression',
    });
  });

  it('reports a crashed worker when qalc is terminated by a signal', async () => {
    const result = await runCalculator(
      '1',
      limits,
      fakeRunner({ exitCode: undefined, stdout: '', isTerminated: true }),
    );
    expect(result.status).toBe('crashed_worker');
  });

  it('does not expose spawn errors', async () => {
    const result = await runCalculator('1', limits, (() => {
      throw new Error('/secret/path: permission denied');
    }) as never);
    expect(result).toEqual({ status: 'upstream_failure', error: 'qalc unavailable' });
  });
});
