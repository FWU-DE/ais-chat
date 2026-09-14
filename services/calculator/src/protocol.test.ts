import { describe, expect, it } from 'vitest';
import { parseCalculatorOutput } from './protocol.js';

describe('qalc protocol', () => {
  it('parses exactly one bounded result', () => {
    expect(parseCalculatorOutput('2\n', 10)).toEqual({ status: 'success', result: '2' });
    expect(parseCalculatorOutput('2\nextra', 100).status).toBe('malformed_output');
    expect(parseCalculatorOutput('12345', 3).status).toBe('malformed_output');
  });

  it('rejects control characters and empty output', () => {
    expect(parseCalculatorOutput('', 10).status).toBe('malformed_output');
    expect(parseCalculatorOutput('2\u0000', 10).status).toBe('malformed_output');
  });
});
