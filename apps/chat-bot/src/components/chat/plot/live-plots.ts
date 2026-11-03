const MAX_LIVE_PLOTS = 4;

export type LivePlot = {
  plotKey: string;
  isVisible: boolean;
  lastSeen: number;
  activate: () => void;
  release: () => void;
};

// Plots whose JSXGraph boards currently exist
const livePlots = new Set<LivePlot>();
// All mounted plot components
const registeredPlots = new Set<LivePlot>();
// Boards are temporarily protected from eviction for export purposes
const plotsRetainedForExport = new Set<LivePlot>();
const activeExportPlotKeys = new Map<string, number>();
let exportActivationCount = 0;
let livePlotsBeforeExport: Set<LivePlot> | undefined;

// Keeps at most MAX_LIVE_PLOTS boards in the DOM. Visible plots are never released.
export function releaseOverflow() {
  while (livePlots.size > MAX_LIVE_PLOTS) {
    const oldest = [...livePlots]
      .filter((plot) => !plot.isVisible && !plotsRetainedForExport.has(plot))
      .sort((a, b) => a.lastSeen - b.lastSeen)[0];
    if (!oldest) {
      return;
    }
    livePlots.delete(oldest);
    oldest.release();
  }
}

export function registerLivePlot(plot: LivePlot) {
  registeredPlots.add(plot);
  if (activeExportPlotKeys.has(plot.plotKey)) {
    livePlots.add(plot);
    plotsRetainedForExport.add(plot);
    plot.activate();
  }
  return () => {
    livePlots.delete(plot);
    registeredPlots.delete(plot);
    plotsRetainedForExport.delete(plot);
  };
}

export function retainLivePlot(plot: LivePlot) {
  livePlots.add(plot);
  releaseOverflow();
}

export function activateLivePlots(plotKeys: ReadonlySet<string>) {
  // Overlapping exports share the state from before the first export so temporary
  // activations from one export can never become the baseline for another.
  if (exportActivationCount === 0) {
    livePlotsBeforeExport = new Set(livePlots);
  }
  exportActivationCount += 1;

  // Count requested keys across exports so matching plots mounted while an export is
  // running are activated by registerLivePlot as well.
  for (const plotKey of plotKeys) {
    activeExportPlotKeys.set(plotKey, (activeExportPlotKeys.get(plotKey) ?? 0) + 1);
  }

  // Only plots present in the exported message or conversation are temporarily retained.
  for (const plot of registeredPlots) {
    if (!plotKeys.has(plot.plotKey)) {
      continue;
    }
    livePlots.add(plot);
    plotsRetainedForExport.add(plot);
    plot.activate();
  }

  let restored = false;
  return () => {
    if (restored) {
      return;
    }
    restored = true;
    exportActivationCount -= 1;

    // Remove this export's key references, but defer board restoration until every
    // overlapping export has finished.
    for (const plotKey of plotKeys) {
      const activationCount = activeExportPlotKeys.get(plotKey) ?? 0;
      if (activationCount <= 1) {
        activeExportPlotKeys.delete(plotKey);
      } else {
        activeExportPlotKeys.set(plotKey, activationCount - 1);
      }
    }
    if (exportActivationCount > 0) {
      return;
    }

    // Return to the original live set while preserving plots that became visible during export.
    for (const plot of registeredPlots) {
      if (livePlotsBeforeExport?.has(plot) === true || plot.isVisible) {
        livePlots.add(plot);
        plot.activate();
      } else {
        livePlots.delete(plot);
        plot.release();
      }
    }
    plotsRetainedForExport.clear();
    activeExportPlotKeys.clear();
    livePlotsBeforeExport = undefined;
    releaseOverflow();
  };
}
