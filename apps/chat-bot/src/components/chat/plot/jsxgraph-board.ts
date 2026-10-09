import JXG from 'jsxgraph';
import { logWarning } from '@shared/logging/logging';
import {
  getSliderRange,
  type BoundingBox,
  type PlotElement,
  type PlotParent,
  type PlotSpec,
} from '@/utils/plot/plot-spec';

const DEFAULT_BOUNDING_BOX: BoundingBox = [-5, 5, 5, -5];

// HTML texts are overlays outside the SVG and would be missing in the PNG export,
// so all labels (axes, element names, texts) are drawn as SVG text.
const textOptions = JXG.Options.text;
textOptions.display = 'internal';
// Drop the built-in Arial so labels inherit the page font.
textOptions.cssDefaultStyle = '';
textOptions.highlightCssDefaultStyle = '';
// `parse: true` (the default) rewrites `^`/`_` into `<sup>`/`<sub>` tags for HTML display;
// with `display: internal` those show up as literal text instead, including in labels
// JSXGraph creates internally (e.g. legend lines), which bypass the per-element override below.
textOptions.parse = false;

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

// Riemann sums and `curve3d`/`parametricsurface3d` call their function(s) directly, so string
// parents must become real functions first. The parameter name matches JSXGraph's own
// convention for each type: `riemannsum` takes a function of `x`, `curve3d` of `u`, and
// `parametricsurface3d` of `u, v`.
function toFunction(board: JXG.Board, value: unknown, variables: string) {
  return typeof value === 'string' ? board.jc.snippet(value, true, variables, false) : value;
}

// Unlike 2D `curve`, `curve3d`/`parametricsurface3d` never parse string parents: fx/fy/fz need
// real functions and bounds need real numbers, or the curve/surface silently renders nothing.
function toNumber(board: JXG.Board, value: unknown) {
  return typeof value === 'string' ? board.jc.snippet(value, true, '', false)() : value;
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
  create: (type: string, parents: unknown[], attributes: Record<string, unknown>) => unknown,
  type: string,
  parents: unknown[],
  attributes: Record<string, unknown>,
) {
  const knownIds = new Set(Object.keys(board.objects));
  try {
    const element = create(type, parents, attributes);
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

// Parents are already validated and (for text payloads) entity-decoded by `parsePlotSpec`;
// this only rewrites them into the shapes specific element types expect to create.
function normalizeParents(board: JXG.Board, type: string, parents: PlotParent[]) {
  // JSXGraph mutates `parents` in place, replacing names with resolved elements. `spec` is
  // memoized and reused across repeated board builds, so cloning keeps that from leaking
  // one board's elements into the next.
  const normalized = structuredClone(parents);
  if (type === 'riemannsum') {
    return [toFunction(board, normalized[0], 'x'), ...normalized.slice(1)];
  }
  if (type === 'curve3d' && normalized.length === 4 && Array.isArray(normalized[3])) {
    return [
      toFunction(board, normalized[0], 'u'),
      toFunction(board, normalized[1], 'u'),
      toFunction(board, normalized[2], 'u'),
      normalized[3].map((bound) => toNumber(board, bound)),
    ];
  }
  if (
    type === 'parametricsurface3d' &&
    normalized.length === 5 &&
    Array.isArray(normalized[3]) &&
    Array.isArray(normalized[4])
  ) {
    return [
      toFunction(board, normalized[0], 'u, v'),
      toFunction(board, normalized[1], 'u, v'),
      toFunction(board, normalized[2], 'u, v'),
      normalized[3].map((bound) => toNumber(board, bound)),
      normalized[4].map((bound) => toNumber(board, bound)),
    ];
  }
  if (
    type === 'functiongraph3d' &&
    normalized.length === 3 &&
    Array.isArray(normalized[1]) &&
    Array.isArray(normalized[2])
  ) {
    return [
      normalized[0],
      normalized[1].map((bound) => toNumber(board, bound)),
      normalized[2].map((bound) => toNumber(board, bound)),
    ];
  }
  if (type === 'measurement' && normalized[2] !== undefined) {
    return [...normalized.slice(0, 2), resolveMeasure(board, normalized[2] as PlotParent)];
  }
  return normalized;
}

function createElements(board: JXG.Board, elements: PlotElement[]) {
  const sliders: (JXG.Slider | undefined)[] = [];
  const explicitView = elements.find(([type]) => type === 'view3d');
  let view: JXG.View3D | undefined;

  if (explicitView !== undefined) {
    // See the comment on `normalizeParents`: clone to avoid JSXGraph mutating the shared spec.
    view = board.create('view3d', structuredClone(explicitView[1]), {
      xPlaneRear: { visible: false },
      yPlaneRear: { visible: false },
      depthOrder: { enabled: true },
      // Axis labels default to "x"/"y"/"z"; the spec can override name/withLabel per axis.
      xAxis: { withLabel: true },
      yAxis: { withLabel: true },
      zAxis: { withLabel: true },
      ...(explicitView[2] ?? {}),
    });
  }

  for (const [type, parents, attributes] of elements) {
    if (type === 'view3d') {
      continue;
    }
    const is3D = type.endsWith('3d');
    if (is3D && view === undefined) {
      continue;
    }
    const isSlider = type === 'slider';
    const range = isSlider ? getSliderRange(parents) : undefined;
    const element = createSafely(
      board,
      is3D ? (t, p, a) => view!.create(t, p, a) : (t, p, a) => board.create(t, p, a),
      type,
      // Sliders are shown as HTML controls below the plot, JSXGraph only keeps their value.
      range === undefined ? normalizeParents(board, type, parents) : [[0, 0], [1, 0], range],
      {
        ...(type === 'integral' ? INTEGRAL_DEFAULTS : {}),
        ...(type === 'angle' ? ANGLE_DEFAULTS : {}),
        ...withSurfaceDefaults(type, attributes ?? {}),
        ...(isSlider ? { visible: false, withLabel: false } : {}),
      },
    );
    if (isSlider) {
      sliders.push(element as JXG.Slider | undefined);
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
      x: {
        name: 'x',
        withLabel: true,
        ...(spec.board.defaultAxes?.x ?? {}),
      },
      y: {
        name: 'y',
        withLabel: true,
        ...(spec.board.defaultAxes?.y ?? {}),
      },
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
          boundingBox: view === undefined ? board.getBoundingBox() : undefined,
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
