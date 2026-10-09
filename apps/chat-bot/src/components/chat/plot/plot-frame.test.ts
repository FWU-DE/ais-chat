import { describe, it, expect } from 'vitest';
import { formatSliderValue } from './plot-frame';

describe('formatSliderValue', () => {
  it('formats power-of-ten steps', () => {
    expect(formatSliderValue(0.1, 0.0001)).toBe('0.1000');
  });

  it('formats fractional non-power-of-ten steps without rounding them away', () => {
    expect(formatSliderValue(0.25, 0.25)).toBe('0.25');
    expect(formatSliderValue(2.5, 2.5)).toBe('2.5');
  });

  it('formats steps given in exponent notation', () => {
    expect(formatSliderValue(0.0000001, 1e-7)).toBe('0.0000001');
  });

  it('formats integer steps without decimals', () => {
    expect(formatSliderValue(3, 1)).toBe('3');
  });

  it('formats negative values using the step precision', () => {
    expect(formatSliderValue(-0.25, 0.25)).toBe('-0.25');
  });

  it('caps precision for steps that never terminate exactly', () => {
    expect(formatSliderValue(1 / 3, 1 / 3)).toBe((1 / 3).toFixed(10));
  });
});
