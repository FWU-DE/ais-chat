import { z } from 'zod';
import stripJsonComments from 'strip-json-comments';

// JSXGraph elements that load external resources or inject HTML.
const BLOCKED_ELEMENT_TYPES = new Set([
  'image',
  'foreignobject',
  'fo', // alias for 'foreignobject'
  'button',
  'input',
  'checkbox',
  'htmlslider',
]);

// JSXGraph parses string parents with JessieCode, which also knows statements and blocks.
const UNSAFE_STRING_PATTERN = /[;{}"'`]/;
const TEXT_TYPES = new Set<string>(['text', 'text3d']);

export type PlotParent = number | string | PlotParent[];

const parentSchema: z.ZodType<PlotParent> = z.lazy(() =>
  z.union([z.number(), z.string(), z.array(parentSchema)]),
);

function hasUnsafeString(parent: PlotParent): boolean {
  if (typeof parent === 'string') {
    return UNSAFE_STRING_PATTERN.test(parent);
  }
  return Array.isArray(parent) && parent.some(hasUnsafeString);
}

const isNumbers = (value: PlotParent | undefined): value is number[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'number');

// `[min, start, max]` or the JSXGraph form `[[x1, y1], [x2, y2], [min, start, max]]`.
export function getSliderRange(parents: PlotParent[]) {
  const range = parents.length === 3 && isNumbers(parents) ? parents : parents[2];
  return isNumbers(range) && range.length === 3 ? (range as [number, number, number]) : undefined;
}

const elementSchema = z
  .tuple([
    z.string().refine((type) => !BLOCKED_ELEMENT_TYPES.has(type.toLowerCase())),
    z.array(parentSchema),
    z.record(z.string(), z.json()).optional(),
  ])
  .refine(([type, parents]) => TEXT_TYPES.has(type) || !parents.some(hasUnsafeString))
  .refine(([type, parents]) => type !== 'slider' || getSliderRange(parents) !== undefined);

// Zod schema for a JSXGraph bounding box `[xMin, yMax, xMax, yMin]`.
const boundingBoxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([xMin, yMax, xMax, yMin]) => xMin < xMax && yMin < yMax);

const plotSpecSchema = z.object({
  board: z
    .object({
      boundingBox: boundingBoxSchema.optional(),
      axis: z.boolean().optional(),
      grid: z.boolean().optional(),
      keepAspectRatio: z.boolean().optional(),
      defaultAxes: z
        .object({
          x: z.record(z.string(), z.json()).optional(),
          y: z.record(z.string(), z.json()).optional(),
        })
        .optional(),
    })
    .default({}),
  elements: z.array(elementSchema).min(1),
});

export type PlotSpec = z.infer<typeof plotSpecSchema>;
export type PlotElement = PlotSpec['elements'][number];
export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export class PlotSpecError extends Error {
  name = 'PlotSpecError';
}

export function parsePlotSpec(source: string): { spec: PlotSpec } | { error: PlotSpecError } {
  let json: unknown;
  try {
    json = JSON.parse(stripJsonComments(source, { trailingCommas: true }));
  } catch (error) {
    return { error: new PlotSpecError('Plot source is not valid JSON', { cause: error }) };
  }
  const result = plotSpecSchema.safeParse(json);
  return result.success
    ? { spec: result.data }
    : { error: new PlotSpecError(z.prettifyError(result.error), { cause: result.error }) };
}

export type SliderDefinition = {
  name: string;
  min: number;
  start: number;
  max: number;
  step: number;
};

// One entry per slider element, in order. Invalid sliders yield `undefined` to keep indexes aligned.
export function getSliderDefinitions(elements: PlotElement[]): (SliderDefinition | undefined)[] {
  return elements
    .filter(([type]) => type === 'slider')
    .map(([, parents, attributes], index) => {
      const range = getSliderRange(parents);
      if (range === undefined || range[0] >= range[2]) {
        return undefined;
      }
      const [min, start, max] = range;
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

export const DEFAULT_BOUNDING_BOX: BoundingBox = [-5, 5, 5, -5];
