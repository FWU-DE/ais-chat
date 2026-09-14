import { describe, expect, it } from 'vitest';
import { validateRequest } from './validation.js';

describe('validation', () => {
  it('accepts an expression and rejects malformed requests', () => {
    expect(validateRequest({ expression: '1 + 1' })).toEqual({
      valid: true,
      value: { expression: '1 + 1' },
    });
    expect(validateRequest({ expression: '' }).valid).toBe(false);
    expect(validateRequest({ expression: '   ' }).valid).toBe(false);
    expect(validateRequest({ expression: 1 }).valid).toBe(false);
    expect(validateRequest(null).valid).toBe(false);
  });

  it('trims before applying the length limit and execution', () => {
    const request = { expression: '  1 + 1  ' };
    expect(validateRequest(request)).toEqual({ valid: true, value: { expression: '1 + 1' } });
    expect(request.expression).toBe('  1 + 1  ');
    expect(validateRequest({ expression: ` ${'x'.repeat(4096)} ` }).valid).toBe(true);
    expect(validateRequest({ expression: ` ${'x'.repeat(4096)}x ` })).toEqual({
      valid: false,
      error: 'expression is too long',
    });
  });
});
