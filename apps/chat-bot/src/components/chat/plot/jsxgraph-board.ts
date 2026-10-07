import JXG from 'jsxgraph';
import { logWarning } from '@shared/logging/logging';
import {
  DEFAULT_BOUNDING_BOX,
  getSliderRange,
  type BoundingBox,
  type PlotElement,
  type PlotParent,
  type PlotSpec,
} from '@/utils/plot/plot-spec';

// HTML texts are overlays outside the SVG and would be missing in the PNG export,
// so all labels (axes, element names, texts) are drawn as SVG text.
const textOptions = (
  JXG.Options as unknown as {
    text: {
      display: string;
      cssDefaultStyle: string;
      highlightCssDefaultStyle: string;
      parse: boolean;
    };
  }
).text;
textOptions.display = 'internal';
// Drop the built-in Arial so labels inherit the page font.
textOptions.cssDefaultStyle = '';
textOptions.highlightCssDefaultStyle = '';
// `parse: true` (the default) rewrites `^`/`_` into `<sup>`/`<sub>` tags for HTML display;
// with `display: internal` those show up as literal text instead, including in labels
// JSXGraph creates internally (e.g. legend lines), which bypass the per-element override below.
textOptions.parse = false;

type Creator = { create: (type: string, parents: unknown[], attributes: object) => unknown };
type ValueElement = { Value: () => number; setValue: (value: number) => unknown };
// The bundled typings do not cover all 3D attributes of the view.
type View3D = Creator & {
  az_slide?: ValueElement;
  el_slide?: ValueElement;
  bank_slide?: ValueElement;
};

// Zoom/pan (2D) and rotation (3D) that are restored when a board is rebuilt.
export type ViewState = {
  boundingBox?: BoundingBox;
  angles?: [number, number, number];
};

const MAX_WIREFRAME_STEPS = 40;
const MAX_SHADED_STEPS = 20;
const SURFACE_DEFAULTS = {
  type: 'shader',
  tiling: 'triangle',
  stepsU: 15,
  stepsV: 15,
  polyhedron: {
    strokeWidth: 0,
    fillOpacity: 0.9,
    shader: { enabled: true, hue: 220, saturation: 80, minLightness: 35, maxLightness: 80 },
  },
};
const SURFACE_TYPES = new Set(['functiongraph3d', 'parametricsurface3d']);
// `display: html` writes via innerHTML and `parse` evaluates JessieCode, so both are forced off.
const FORBIDDEN_ATTRIBUTES = new Set([
  'display',
  'parse',
  'usemathjax',
  'usekatex',
  'url',
  '__proto__',
  'constructor',
  'prototype',
]);

// Text is rendered with `display: 'internal'` (plain SVG text, see below), so JSXGraph never runs
// an HTML parser over it and named entities like `&alpha;` would otherwise show up literally.
function decodeEntities(value: string) {
  return new DOMParser().parseFromString(value, 'text/html').documentElement.textContent ?? value;
}

function stripMarkup(value: string) {
  // Decoding can turn an entity like `&lt;` back into `<`, so strip markup afterwards.
  return decodeEntities(value).replace(/[<>]/g, '');
}

function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    return stripMarkup(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !FORBIDDEN_ATTRIBUTES.has(key.toLowerCase()))
        .map(([key, entry]) => [key, sanitize(entry)]),
    );
  }
  return value;
}

function normalizeParent(type: string, value: unknown): unknown {
  if (typeof value === 'string') {
    return type === 'text' || type === 'text3d' ? stripMarkup(value) : value;
  }
  return Array.isArray(value) ? value.map((entry) => normalizeParent(type, entry)) : value;
}

// The area between a curve and the x-axis would otherwise show draggable helper points and labels.
const INTEGRAL_DEFAULTS = {
  curveLeft: { visible: false },
  curveRight: { visible: false },
  baseLeft: { visible: false },
  baseRight: { visible: false },
  label: { visible: false },
};

// Right angles are marked with a dotted sector instead of JSXGraph's default square by default.
const ANGLE_DEFAULTS = { orthoType: 'sectordot' };

// Riemann sums call their function directly, so a string must become a real function first.
function toFunction(board: JXG.Board, value: unknown) {
  const { jc } = board as unknown as {
    jc: { snippet: (code: string, wrap: boolean, variable: string, geonext: boolean) => unknown };
  };
  return typeof value === 'string' ? jc.snippet(value, true, 'x', false) : value;
}

// Unlike 2D `curve`, `curve3d` never parses string parents: fx/fy/fz need real functions and the
// trailing [min, max] range needs real numbers, or the curve silently renders zero points.
function toNumber(board: JXG.Board, value: unknown) {
  const { jc } = board as unknown as {
    jc: {
      snippet: (code: string, wrap: boolean, variable: string, geonext: boolean) => () => number;
    };
  };
  return typeof value === 'string' ? jc.snippet(value, true, '', false)() : value;
}

// Surfaces are drawn as shaded faces by default. Steps are capped because every face is a DOM node.
function withSurfaceDefaults(type: string, attributes: Record<string, unknown>) {
  if (!SURFACE_TYPES.has(type)) {
    return attributes;
  }
  const polyhedron = attributes.polyhedron as Record<string, unknown> | undefined;
  const shader = polyhedron?.shader as Record<string, unknown> | undefined;
  const merged = {
    ...SURFACE_DEFAULTS,
    ...attributes,
    polyhedron: {
      ...SURFACE_DEFAULTS.polyhedron,
      ...polyhedron,
      shader: { ...SURFACE_DEFAULTS.polyhedron.shader, ...shader },
    },
  };
  const limit = merged.type === 'wireframe' ? MAX_WIREFRAME_STEPS : MAX_SHADED_STEPS;
  const clamp = (value: unknown) =>
    typeof value === 'number' ? Math.min(Math.max(value, 1), limit) : limit;
  return { ...merged, stepsU: clamp(merged.stepsU), stepsV: clamp(merged.stepsV) };
}

// JSXGraph registers an element before it validates its parents, so a failed creation leaves
// a broken object behind that throws on every later update. Remove it again.
function createSafely(
  board: JXG.Board,
  creator: Creator,
  type: string,
  parents: unknown[],
  attributes: object,
) {
  const knownIds = new Set(Object.keys(board.objects));
  try {
    const element = creator.create(type, parents, attributes);
    if (!type.endsWith('3d')) {
      board.update();
    }
    return element;
  } catch (error) {
    logWarning('Plot element could not be created', {
      type,
      message: error instanceof Error ? error.message : String(error),
    });
    for (const id of Object.keys(board.objects)) {
      if (!knownIds.has(id)) {
        try {
          board.removeObject(id);
        } catch {
          // The broken object is already unusable, nothing more to clean up.
        }
      }
    }
    return undefined;
  }
}

// Measurements take elements, not names: `['Area', 'Q']` becomes `['Area', <polygon Q>]`.
function resolveMeasure(board: JXG.Board, expression: PlotParent): unknown {
  if (!Array.isArray(expression)) {
    return expression;
  }
  const [operator, ...operands] = expression;
  return [
    operator,
    ...operands.map((operand) =>
      typeof operand === 'string' ? board.select(operand, true) : resolveMeasure(board, operand),
    ),
  ];
}

function normalizeParents(board: JXG.Board, type: string, parents: PlotParent[]) {
  const normalized = parents.map((parent) => normalizeParent(type, parent));
  if (type === 'riemannsum') {
    return [toFunction(board, normalized[0]), ...normalized.slice(1)];
  }
  if (type === 'curve3d' && normalized.length === 4 && Array.isArray(normalized[3])) {
    return [
      toFunction(board, normalized[0]),
      toFunction(board, normalized[1]),
      toFunction(board, normalized[2]),
      normalized[3].map((bound) => toNumber(board, bound)),
    ];
  }
  if (type === 'measurement' && normalized[2] !== undefined) {
    return [...normalized.slice(0, 2), resolveMeasure(board, normalized[2] as PlotParent)];
  }
  return normalized;
}

function createElements(jsxBoard: JXG.Board, elements: PlotElement[]) {
  const board = jsxBoard as unknown as Creator;
  const sliders: (ValueElement | undefined)[] = [];
  const explicitView = elements.find(([type]) => type === 'view3d');
  let view: View3D | undefined;

  if (explicitView !== undefined) {
    view = board.create('view3d', explicitView[1], {
      xPlaneRear: { visible: false },
      yPlaneRear: { visible: false },
      depthOrder: { enabled: true },
      // Axis labels default to "x"/"y"/"z"; the spec can override name/withLabel per axis.
      xAxis: { withLabel: true },
      yAxis: { withLabel: true },
      zAxis: { withLabel: true },
      ...(sanitize(explicitView[2] ?? {}) as object),
    }) as View3D;
  }

  for (const [type, parents, attributes] of elements) {
    if (type === 'view3d') {
      continue;
    }
    const creator = type.endsWith('3d') ? view : board;
    if (creator === undefined) {
      continue;
    }
    const isSlider = type === 'slider';
    const range = isSlider ? getSliderRange(parents) : undefined;
    const element = createSafely(
      jsxBoard,
      creator,
      type,
      // Sliders are shown as HTML controls below the plot, JSXGraph only keeps their value.
      range === undefined ? normalizeParents(jsxBoard, type, parents) : [[0, 0], [1, 0], range],
      {
        ...(type === 'integral' ? INTEGRAL_DEFAULTS : {}),
        ...(type === 'angle' ? ANGLE_DEFAULTS : {}),
        ...withSurfaceDefaults(type, sanitize(attributes ?? {}) as Record<string, unknown>),
        ...(isSlider ? { visible: false, withLabel: false } : {}),
        display: 'internal',
        parse: false,
        useMathJax: false,
        useKatex: false,
      },
    );
    if (isSlider) {
      sliders.push(element as ValueElement | undefined);
    }
  }
  return { view, sliders };
}

// 3D views rotate on plain click-drag via their own pointer handler, which only activates
// when the board isn't already busy panning. Board panning must therefore stay disabled
// for 3D plots (in both fullscreen and inline) so rotation behaves consistently.
function getInteractionOptions(spec: PlotSpec, isFullscreen: boolean) {
  const is3D = spec.elements.some(([type]) => type === 'view3d');
  return {
    // Fullscreen owns the whole input surface and locks page scroll, so shift is not needed there.
    pan: is3D ? { enabled: false } : { needShift: !isFullscreen },
    zoom: { needShift: !isFullscreen },
  };
}

export function applyInteractionOptions(board: JXG.Board, spec: PlotSpec, isFullscreen: boolean) {
  const { pan, zoom } = getInteractionOptions(spec, isFullscreen);
  board.setAttribute({ pan, zoom });
}

export function createBoard(
  container: HTMLElement,
  spec: PlotSpec,
  viewState: ViewState | undefined,
  sliderValues: number[],
  isFullscreen: boolean,
) {
  // Bar and line charts need free axis scales, everything else (geometry, pie charts) must stay round.
  const hasScaledChart = spec.elements.some(
    ([type, , attributes]) => type === 'chart' && attributes?.chartStyle !== 'pie',
  );

  const board = JXG.JSXGraph.initBoard(container, {
    boundingBox: viewState?.boundingBox ?? spec.board.boundingBox ?? DEFAULT_BOUNDING_BOX,
    axis: spec.board.axis ?? true,
    grid: spec.board.grid ?? false,
    showCopyright: false,
    showNavigation: false,
    keepAspectRatio: spec.board.keepAspectRatio ?? !hasScaledChart,
    ...getInteractionOptions(spec, isFullscreen),
    // Default axes are labelled "x"/"y" unless the spec overrides the name/label via defaultAxes.
    defaultAxes: {
      x: { name: 'x', withLabel: true, ...(sanitize(spec.board.defaultAxes?.x ?? {}) as object) },
      y: { name: 'y', withLabel: true, ...(sanitize(spec.board.defaultAxes?.y ?? {}) as object) },
    },
  });

  try {
    const { view, sliders } = createElements(board, spec.elements);

    sliders.forEach((slider, index) => {
      const value = sliderValues[index];
      if (value !== undefined) {
        slider?.setValue(value);
      }
    });
    if (view !== undefined && viewState?.angles !== undefined) {
      const [az, el, bank] = viewState.angles;
      view.az_slide?.setValue(az);
      view.el_slide?.setValue(el);
      view.bank_slide?.setValue(bank);
    }
    try {
      board.fullUpdate();
    } catch {
      // Keep the board even if a single element misbehaves on the final update.
    }

    return {
      board,
      setSlider: (index: number, value: number) => {
        sliders[index]?.setValue(value);
        board.update();
      },
      capture: (): ViewState => {
        const { az_slide: az, el_slide: el, bank_slide: bank } = view ?? {};
        return {
          boundingBox: view === undefined ? (board.getBoundingBox() as BoundingBox) : undefined,
          angles:
            az === undefined || el === undefined || bank === undefined
              ? undefined
              : [az.Value(), el.Value(), bank.Value()],
        };
      },
    };
  } catch (error) {
    JXG.JSXGraph.freeBoard(board);
    throw error;
  }
}
