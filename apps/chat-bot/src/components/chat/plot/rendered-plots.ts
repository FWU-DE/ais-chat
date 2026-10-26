import type { PlotSpec } from '@/utils/plot/plot-spec';

const renderedPlots = new Map<string, Set<SVGSVGElement>>();

function checksum(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getKey(spec: PlotSpec) {
  return `spec:${checksum(JSON.stringify(spec))}`;
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
