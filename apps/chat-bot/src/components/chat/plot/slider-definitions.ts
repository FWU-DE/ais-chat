import { getSliderRange, type PlotElement } from '@/utils/plot/plot-spec';

export type SliderDefinition = {
  name: string;
  min: number;
  start: number;
  max: number;
  step: number;
};

// One entry per slider element, in order.
export function getSliderDefinitions(elements: PlotElement[]): SliderDefinition[] {
  return elements
    .filter(([type]) => type === 'slider')
    .map(([, parents, attributes], index) => {
      // `parsePlotSpec` already rejects sliders with an invalid or degenerate range.
      const [min, start, max] = getSliderRange(parents)!;
      const name = attributes?.name;
      const snapWidth = attributes?.snapWidth;
      return {
        name: typeof name === 'string' ? name : `slider${index + 1}`,
        min,
        start: Math.min(Math.max(start, min), max),
        max,
        step: typeof snapWidth === 'number' && snapWidth > 0 ? snapWidth : (max - min) / 100,
      };
    });
}
