import type { PlotSpec } from '@/utils/plot/plot-spec';

const renderedPlots = new Map<string, Set<SVGSVGElement>>();

function getKey(spec: PlotSpec) {
  return `spec:${JSON.stringify(spec)}`;
}

export function registerRenderedPlot(spec: PlotSpec, svg: SVGSVGElement) {
  const key = getKey(spec);
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

export function getRenderedPlot(spec: PlotSpec) {
  const plots = renderedPlots.get(getKey(spec));
  if (plots === undefined) {
    return undefined;
  }
  return [...plots].findLast((svg) => svg.isConnected);
}
