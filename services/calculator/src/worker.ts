import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { parseCalculatorOutput } from './protocol.js';
import type { Limits, Result, RunOptions } from './types.js';

export const QALC_ARGS = [
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
] as const;
export type CalculatorRunner = typeof execa;
export type SpawnCalculator = CalculatorRunner;

export async function runCalculator(
  expression: string,
  limits: Limits,
  runner: CalculatorRunner = execa,
  options: RunOptions = {},
): Promise<Result> {
  if (options.signal?.aborted) {
    return { status: 'upstream_failure', error: 'request cancelled' };
  }
  let home: string | undefined;
  try {
    home = await mkdtemp(join(tmpdir(), 'qalc-'));
    if (options.signal?.aborted) {
      return { status: 'upstream_failure', error: 'request cancelled' };
    }

    // A fresh process and private HOME keep qalc stateless and isolate requests from one another.
    const result = await runner('qalc', [...QALC_ARGS, '--', expression], {
      cwd: home,
      env: { PATH: process.env.PATH ?? '', HOME: home },
      extendEnv: false,
      shell: false,
      timeout: limits.wallTimeMs,
      cancelSignal: options.signal,
      maxBuffer: limits.maxOutputBytes,
      encoding: 'buffer',
      stderr: 'ignore',
      reject: false,
    });
    if (options.signal?.aborted) {
      return { status: 'upstream_failure', error: 'request cancelled' };
    }
    if (result.isMaxBuffer) {
      return { status: 'malformed_output', error: 'output too large' };
    }
    if (result.timedOut) {
      return { status: 'timeout', error: 'qalc timed out' };
    }
    if (result.isTerminated) {
      return { status: 'crashed_worker', error: 'qalc worker crashed' };
    }
    if (result.exitCode !== 0) {
      return { status: 'invalid_input', error: 'qalc could not evaluate the expression' };
    }
    return parseCalculatorOutput(
      Buffer.from(result.stdout).toString('utf8'),
      limits.maxOutputBytes,
    );
  } catch {
    return { status: 'upstream_failure', error: 'qalc unavailable' };
  } finally {
    if (home) {
      await rm(home, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
