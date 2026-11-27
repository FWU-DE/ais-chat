import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

import { activateLivePlots } from '@/components/chat/plot/live-plots';
import { getPlotKey } from '@/components/chat/plot/rendered-plots';
import { PLOT_LANGUAGE } from '@/utils/code-blocks';
import { getValidPlotSpec, type PlotSpec } from '@/utils/plot/plot-spec';

import { type PlotImage, renderPlotImage, waitForPlotActivation } from './plot-image';

const MAX_PLOTS = 10;

// Renders each distinct, valid jsxgraph-json block to a PNG keyed by its code;
// plots can only be drawn in the browser, so they are embedded as images.
export async function renderDocumentPlots(root: Root): Promise<Map<string, PlotImage>> {
  const specs = new Map<string, PlotSpec>();
  visit(root, 'code', (node) => {
    const spec = node.lang === PLOT_LANGUAGE ? getValidPlotSpec(node.value) : undefined;
    if (spec !== undefined && specs.size < MAX_PLOTS) {
      specs.set(node.value, spec);
    }
  });
  const images = new Map<string, PlotImage>();
  if (specs.size === 0) {
    return images;
  }

  const restoreLivePlots = activateLivePlots(new Set([...specs.values()].map(getPlotKey)));
  try {
    await waitForPlotActivation();
    await Promise.all(
      [...specs].map(async ([code, spec]) => {
        const image = await renderPlotImage(spec);
        if (image !== undefined) {
          images.set(code, image);
        }
      }),
    );
  } finally {
    restoreLivePlots();
  }
  return images;
}

// Get all image targets used in the Markdown, so only those uploads are loaded.
export function getReferencedImageSources(root: Root) {
  const sources = new Set<string>();
  visit(root, 'image', (node) => {
    sources.add(node.url);
  });
  visit(root, 'definition', (node) => {
    sources.add(node.url);
  });
  return sources;
}
