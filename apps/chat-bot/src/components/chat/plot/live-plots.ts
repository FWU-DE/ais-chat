const MAX_LIVE_PLOTS = 4;

export type LivePlot = {
  isVisible: boolean;
  lastSeen: number;
  activate: () => void;
  release: () => void;
};

const livePlots = new Set<LivePlot>();
const registeredPlots = new Set<LivePlot>();

// Keeps at most MAX_LIVE_PLOTS boards in the DOM. Visible plots are never released.
export function releaseOverflow() {
  while (livePlots.size > MAX_LIVE_PLOTS) {
    const oldest = [...livePlots]
      .filter((plot) => !plot.isVisible)
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
  retainLivePlot(plot);
  return () => {
    livePlots.delete(plot);
    registeredPlots.delete(plot);
  };
}

export function retainLivePlot(plot: LivePlot) {
  livePlots.add(plot);
  releaseOverflow();
}

export function activateAllLivePlots() {
  const previousState = new Map(
    [...registeredPlots].map((plot) => [
      plot,
      { isVisible: plot.isVisible, isLive: livePlots.has(plot) },
    ]),
  );

  for (const plot of registeredPlots) {
    livePlots.add(plot);
    plot.isVisible = true;
    plot.activate();
  }

  return () => {
    for (const plot of registeredPlots) {
      const state = previousState.get(plot);
      if (state?.isLive === true) {
        livePlots.add(plot);
        plot.activate();
      } else {
        livePlots.delete(plot);
        plot.release();
      }
      plot.isVisible = state?.isVisible ?? false;
    }
  };
}
