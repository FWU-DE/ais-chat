import { logWarning } from '@shared/logging';
import JXG from 'jsxgraph';

import { createBoard } from '@/components/chat/plot/jsxgraph-board';
import { renderPlotPng } from '@/components/chat/plot/png-export';
import { getRenderedPlot } from '@/components/chat/plot/rendered-plots';
import { type BoundingBox, type PlotSpec } from '@/utils/plot/plot-spec';

const PLOT_IMAGE_WIDTH = 600;
const PLOT_IMAGE_MIN_HEIGHT = 260;
const PLOT_IMAGE_MAX_HEIGHT = 450;
const DEFAULT_PLOT_BOUNDING_BOX: BoundingBox = [-5, 5, 5, -5];

export type PlotImage = { width: number; height: number; data: ArrayBuffer };

function getPlotImageDimensions(boundingBox: BoundingBox) {
  const [xMin, yMax, xMax, yMin] = boundingBox;
  const aspectRatio = (xMax - xMin) / (yMax - yMin);
  return {
    width: PLOT_IMAGE_WIDTH,
    height: Math.round(
      Math.min(
        PLOT_IMAGE_MAX_HEIGHT,
        Math.max(PLOT_IMAGE_MIN_HEIGHT, PLOT_IMAGE_WIDTH / aspectRatio),
      ),
    ),
  };
}

export async function waitForPlotActivation() {
  if (typeof requestAnimationFrame === 'undefined') {
    return;
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

// Renders a plot as PNG, preferring the board that is already visible in the chat.
export async function renderPlotImage(spec: PlotSpec): Promise<PlotImage | undefined> {
  try {
    const renderedPlot = getRenderedPlot(spec);
    if (renderedPlot !== undefined) {
      const { width: renderedWidth, height: renderedHeight } = renderedPlot.getBoundingClientRect();
      const scale = Math.min(
        PLOT_IMAGE_WIDTH / renderedWidth,
        PLOT_IMAGE_MAX_HEIGHT / renderedHeight,
      );
      const png = await renderPlotPng(renderedPlot);
      return {
        width: Math.round(renderedWidth * scale),
        height: Math.round(renderedHeight * scale),
        data: await png.arrayBuffer(),
      };
    }

    const { width, height } = getPlotImageDimensions(
      spec.board.boundingBox ?? DEFAULT_PLOT_BOUNDING_BOX,
    );
    const container = document.createElement('div');
    container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
    document.body.append(container);

    let board: JXG.Board | undefined;
    try {
      board = createBoard(container, spec, undefined, [], false).board;
      // sync jsx graph rendering with the browser's rendering cycle
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      board.fullUpdate();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const svg = container.querySelector('svg');
      if (svg === null) {
        return undefined;
      }

      const png = await renderPlotPng(svg);
      return { width, height, data: await png.arrayBuffer() };
    } finally {
      if (board !== undefined) {
        JXG.JSXGraph.freeBoard(board);
      }
      container.remove();
    }
  } catch (error) {
    logWarning('Plot could not be exported', {
      message: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
