import type { ElementType } from './plot-element-types';
import type { PlotParent } from './plot-sanitize';

const isNumbers = (value: PlotParent | undefined): value is number[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'number');

// `[min, start, max]` or the JSXGraph form `[[x1, y1], [x2, y2], [min, start, max]]`.
export function getSliderRange(parents: PlotParent[]) {
  const range = parents.length === 3 && isNumbers(parents) ? parents : parents[2];
  return isNumbers(range) && range.length === 3 ? (range as [number, number, number]) : undefined;
}

// Per-type checks beyond the generic parent schema, each returning an error message (or
// `undefined` when valid). Add an entry here for any other type that needs its own validation.
type ElementValidator = (parents: PlotParent[]) => string | undefined;

const isBound = (value: PlotParent | undefined): value is PlotParent[] =>
  Array.isArray(value) && value.length === 2;

// JSXGraph silently misreads a malformed bound (e.g. a whole range written as one string
// instead of an array) instead of erroring, so it's caught here.
function validateBounds(...indexes: number[]): ElementValidator {
  return (parents) =>
    parents.length === Math.max(...indexes) + 1 && indexes.some((index) => !isBound(parents[index]))
      ? 'a range/bounds parent must be a two-element array, e.g. `[0, "2*PI"]`'
      : undefined;
}

export const ELEMENT_VALIDATORS: Partial<Record<ElementType, ElementValidator>> = {
  slider: (parents) => {
    const range = getSliderRange(parents);
    if (range === undefined) {
      return 'parents must include a `[min, start, max]` range';
    }
    return range[0] >= range[2] ? '`min` must be less than `max`' : undefined;
  },
  curve3d: validateBounds(3),
  parametricsurface3d: validateBounds(3, 4),
  functiongraph3d: validateBounds(1, 2),
};
