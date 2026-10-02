const MAX_LIVE_PLOTS = 4;

export type LivePlot = {
  isVisible: boolean;
  lastSeen: number;
  release: () => void;
};

const livePlots = new Set<LivePlot>();

// Keeps at most MAX_LIVE_PLOTS boards in the DOM. Visible plots are never released.
export function releaseOverflow() {
  while (livePlots.size > MAX_LIVE_PLOTS) {
    const oldest = [...livePlots]
      .filter((plot) => !plot.isVisible)
      .sort((a, b) => a.lastSeen - b.lastSeen)[0];
    if (oldest === undefined) {
      return;
    }
    livePlots.delete(oldest);
    oldest.release();
  }
}

export function registerLivePlot(plot: LivePlot) {
  livePlots.add(plot);
  releaseOverflow();
  return () => {
    livePlots.delete(plot);
  };
}
