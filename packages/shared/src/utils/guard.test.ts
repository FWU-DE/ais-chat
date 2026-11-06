import { describe, expect, it } from 'vitest';

import { getDefinedOrThrow, isDefined, isNotNull } from './guard';

describe('isDefined', () => {
  it('should return true if the value is defined', () => {
    const value = 'test';
    expect(isDefined(value)).toBe(true);
  });

  it('should return false if the value is undefined', () => {
    const value = undefined;
    expect(isDefined(value)).toBe(false);
  });
});

describe('isNotNull', () => {
  it('should return true if the value is not null', () => {
    const value = 'test';
    expect(isNotNull(value)).toBe(true);
  });

  it('should return false if the value is null', () => {
    const value = null;
    expect(isNotNull(value)).toBe(false);
  });
});

describe('getDefinedOrThrow', () => {
  it('should return the value if it is defined', () => {
    const value = 'test';
    const result = getDefinedOrThrow(value, 'testValue');
    expect(result).toBe(value);
  });

  it('should throw an error if the value is undefined', () => {
    const value = undefined;
    expect(() => getDefinedOrThrow(value, 'testValue')).toThrowError(
      'Expected testValue to be defined.',
    );
  });
});
