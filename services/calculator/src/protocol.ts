import type { Result } from './types.js';

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code >= 0 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
  });
}

export function parseCalculatorOutput(stdout: string, maxBytes: number): Result {
  // qalc is an untrusted subprocess; accept only bounded, printable output.
  if (Buffer.byteLength(stdout) > maxBytes) {
    return { status: 'malformed_output', error: 'output too large' };
  }

  const result = stdout.trim();
  if (result.length === 0 || containsControlCharacter(result)) {
    return { status: 'malformed_output', error: 'qalc returned malformed output' };
  }

  return { status: 'success', result };
}
