const MAX_LIVE_PLOTS = 4;

export type LivePlot = {
  isVisible: boolean;
  lastSeen: number;
  activate: () => void;
  release: () => void;
};

const livePlots = new Set<LivePlot>();
const registeredPlots = new Set<LivePlot>();
const plotsRetainedForExport = new Set<LivePlot>();
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
  if (exportActivationCount > 0) {
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

export function activateAllLivePlots() {
  if (exportActivationCount === 0) {
    livePlotsBeforeExport = new Set(livePlots);
  }
  exportActivationCount += 1;

  for (const plot of registeredPlots) {
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
    if (exportActivationCount > 0) {
      return;
    }

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
    livePlotsBeforeExport = undefined;
    releaseOverflow();
  };
}
