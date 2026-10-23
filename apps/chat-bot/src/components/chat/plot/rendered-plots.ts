import type { PlotSpec } from '@/utils/plot/plot-spec';

const renderedPlots = new Map<string, Set<SVGSVGElement>>();

function getKey(spec: PlotSpec, plotId?: string) {
  return plotId ?? `spec:${JSON.stringify(spec)}`;
}

export function getRenderedPlotId(messageId: string, plotIndex: number) {
  return `occurrence:${JSON.stringify([messageId, plotIndex])}`;
}

export function registerRenderedPlot(spec: PlotSpec, svg: SVGSVGElement, plotId?: string) {
  const key = getKey(spec, plotId);
  const plots = renderedPlots.get(key) ?? new Set<SVGSVGElement>();
  plots.add(svg);
  renderedPlots.set(key, plots);

  return () => {
    plots.delete(svg);
    if (plots.size === 0) {
      renderedPlots.delete(key);
    }
  };
}

export function getRenderedPlot(spec: PlotSpec, plotId?: string) {
  const plots = renderedPlots.get(getKey(spec, plotId));
  if (plots === undefined) {
    return undefined;
  }
  return [...plots].findLast((svg) => svg.isConnected);
}
