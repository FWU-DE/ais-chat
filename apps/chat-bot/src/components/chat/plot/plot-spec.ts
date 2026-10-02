import { z } from 'zod';

const MAX_ELEMENTS = 100;
const MAX_STRING_LENGTH = 200;

// JSXGraph elements the model may create. Excludes anything that loads external resources
// or injects HTML (image, foreignobject, button, input, checkbox, htmlslider).
const PLOT_ELEMENT_TYPES = [
  'angle',
  'arc',
  'arrow',
  'arrowparallel',
  'axis',
  'bisector',
  'bisectorlines',
  'boxplot',
  'cardinalspline',
  'chart',
  'circle',
  'circumcenter',
  'circumcircle',
  'circumcirclearc',
  'circumcirclemidpoint',
  'circumcirclesector',
  'comb',
  'conic',
  'curve',
  'curveconcat',
  'curvedifference',
  'curveintersection',
  'curveunion',
  'derivative',
  'ellipse',
  'functiongraph',
  'glider',
  'grid',
  'group',
  'hatch',
  'hyperbola',
  'implicitcurve',
  'incenter',
  'incircle',
  'inequality',
  'integral',
  'intersection',
  'legend',
  'line',
  'locus',
  'majorarc',
  'majorsector',
  'measurement',
  'midpoint',
  'minorarc',
  'minorsector',
  'mirrorelement',
  'mirrorpoint',
  'msector',
  'nonreflexangle',
  'normal',
  'orthogonalprojection',
  'otherintersection',
  'parabola',
  'parallel',
  'parallelogram',
  'parallelpoint',
  'perpendicular',
  'perpendicularpoint',
  'perpendicularsegment',
  'plot',
  'point',
  'polar',
  'polarline',
  'polepoint',
  'polygon',
  'polygonalchain',
  'radicalaxis',
  'reflection',
  'reflexangle',
  'regularpolygon',
  'riemannsum',
  'sector',
  'segment',
  'semicircle',
  'slider',
  'slopefield',
  'slopetriangle',
  'spline',
  'stepfunction',
  'tangent',
  'tangentto',
  'tapemeasure',
  'text',
  'ticks',
  'tracecurve',
  'transform',
  'vectorfield',
  'view3d',
  'circle3d',
  'curve3d',
  'face3d',
  'functiongraph3d',
  'intersectioncircle3d',
  'intersectionline3d',
  'line3d',
  'parametricsurface3d',
  'plane3d',
  'point3d',
  'polygon3d',
  'polyhedron3d',
  'sphere3d',
  'text3d',
  'vectorfield3d',
] as const;

// JSXGraph parses string parents (functions, element names) with JessieCode, which also knows
// loops and function definitions. Only plain expressions are allowed, so no statements or blocks.
const EXPRESSION_PATTERN = /^[A-Za-z0-9_ .,+\-*/^()<>=!?:&|%']*$/;
const FORBIDDEN_WORDS =
  /\b(while|for|do|function|return|if|else|eval|ev|use|import|delete|this|new|JXG)\b/;
const TEXT_TYPES = new Set<string>(['text', 'text3d']);

export type PlotParent = number | string | PlotParent[];

const parentSchema: z.ZodType<PlotParent> = z.lazy(() =>
  z.union([z.number(), z.string().max(MAX_STRING_LENGTH), z.array(parentSchema).max(500)]),
);

function hasUnsafeString(parent: PlotParent): boolean {
  if (typeof parent === 'string') {
    return !EXPRESSION_PATTERN.test(parent) || FORBIDDEN_WORDS.test(parent);
  }
  return Array.isArray(parent) && parent.some(hasUnsafeString);
}

const elementSchema = z
  .tuple([
    z.enum(PLOT_ELEMENT_TYPES),
    z.array(parentSchema).max(20),
    z.record(z.string().max(40), z.json()).optional(),
  ])
  .refine(([type, parents]) => TEXT_TYPES.has(type) || !parents.some(hasUnsafeString));

const plotSpecSchema = z.object({
  board: z
    .object({
      boundingBox: z
        .tuple([z.number(), z.number(), z.number(), z.number()])
        .refine(([xMin, yMax, xMax, yMin]) => xMin < xMax && yMin < yMax)
        .optional(),
      axis: z.boolean().optional(),
      grid: z.boolean().optional(),
      keepAspectRatio: z.boolean().optional(),
    })
    .default({}),
  elements: z.array(elementSchema).min(1).max(MAX_ELEMENTS),
});

export type PlotSpec = z.infer<typeof plotSpecSchema>;
export type PlotElement = PlotSpec['elements'][number];
export type BoundingBox = [number, number, number, number];

export function parsePlotSpec(source: string): PlotSpec | undefined {
  try {
    const result = plotSpecSchema.safeParse(JSON.parse(source));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export type SliderDefinition = {
  name: string;
  min: number;
  start: number;
  max: number;
  step: number;
};

const isNumbers = (value: PlotParent | undefined): value is number[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'number');

// `[min, start, max]` or the JSXGraph form `[[x1, y1], [x2, y2], [min, start, max]]`.
export function getSliderRange(parents: PlotParent[]) {
  const range = parents.length === 3 && isNumbers(parents) ? parents : parents[2];
  return isNumbers(range) && range.length === 3 ? (range as [number, number, number]) : undefined;
}

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

const DEFAULT_BOUNDING_BOX: BoundingBox = [-5, 5, 5, -5];
const BOX_PADDING = 0.15;

// Fallback view that contains all literal coordinates of the elements.
export function getAutoBoundingBox(elements: PlotElement[]): BoundingBox {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => {
    xs.push(x);
    ys.push(y);
  };
  const collect = (value: PlotParent) => {
    if (!Array.isArray(value)) {
      return;
    }
    if (value.length === 2 && isNumbers(value)) {
      add(value[0] as number, value[1] as number);
      return;
    }
    value.forEach(collect);
  };

  for (const [type, parents] of elements) {
    const [first, second] = parents;
    if (type === 'view3d' || type.endsWith('3d')) {
      continue;
    }
    if (type === 'chart' && isNumbers(first)) {
      const values = isNumbers(second) ? second : first;
      const positions = isNumbers(second) ? first : values.map((_, index) => index + 1);
      positions.forEach((x, index) => {
        add(x - 0.5, 0);
        add(x + 0.5, values[index] ?? 0);
      });
    } else if (type === 'circle' && Array.isArray(first) && typeof second === 'number') {
      const [cx, cy] = first;
      if (typeof cx === 'number' && typeof cy === 'number') {
        add(cx - second, cy - second);
        add(cx + second, cy + second);
      }
    } else if ((type === 'point' || type === 'text') && isNumbers([first, second] as number[])) {
      add(first as number, second as number);
    } else {
      parents.forEach(collect);
    }
  }

  if (xs.length === 0) {
    return DEFAULT_BOUNDING_BOX;
  }
  const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
  const [yMin, yMax] = [Math.min(...ys), Math.max(...ys)];
  const xPadding = (xMax - xMin || 2) * BOX_PADDING;
  const yPadding = (yMax - yMin || 2) * BOX_PADDING;
  return [xMin - xPadding, yMax + yPadding, xMax + xPadding, yMin - yPadding];
}
