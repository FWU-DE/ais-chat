import { describe, it, expect } from 'vitest';
import type { PlotElement } from '@/utils/plot/plot-spec';
import { getSliderDefinitions } from './slider-definitions';

describe('getSliderDefinitions', () => {
  const slider = (parents: PlotElement[1], attributes?: PlotElement[2]): PlotElement => [
    'slider',
    parents,
    attributes,
  ];

  it('ignores non-slider elements', () => {
    expect(getSliderDefinitions([['point', [0, 0], undefined]])).toEqual([]);
  });

  it('builds a definition from a valid slider', () => {
    const [definition] = getSliderDefinitions([slider([0, 1, 3], { name: 'a' })]);
    expect(definition).toEqual({ name: 'a', min: 0, start: 1, max: 3, step: 0.03 });
  });

  it('falls back to an indexed name when none is given', () => {
    const [first, second] = getSliderDefinitions([slider([0, 1, 3]), slider([0, 1, 3])]);
    expect(first?.name).toBe('slider1');
    expect(second?.name).toBe('slider2');
  });

  it('clamps the start value into [min, max]', () => {
    const [tooLow] = getSliderDefinitions([slider([0, -5, 3])]);
    expect(tooLow?.start).toBe(0);
    const [tooHigh] = getSliderDefinitions([slider([0, 50, 3])]);
    expect(tooHigh?.start).toBe(3);
  });

  it('uses snapWidth as the step when positive', () => {
    const [definition] = getSliderDefinitions([slider([0, 1, 3], { snapWidth: 0.5 })]);
    expect(definition?.step).toBe(0.5);
  });

  it('ignores a non-positive snapWidth', () => {
    const [definition] = getSliderDefinitions([slider([0, 1, 3], { snapWidth: -1 })]);
    expect(definition?.step).toBeCloseTo(0.03);
  });
});
