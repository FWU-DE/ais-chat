import { describe, it, expect } from 'vitest';
import { registerLivePlot, releaseOverflow, type LivePlot } from './live-plots';

function makePlot(lastSeen: number, isVisible = false): LivePlot & { released: boolean } {
  const plot = {
    isVisible,
    lastSeen,
    released: false,
    release() {
      plot.released = true;
    },
  };
  return plot;
}

describe('registerLivePlot / releaseOverflow', () => {
  it('keeps up to 4 plots without releasing any', () => {
    const plots = [makePlot(1), makePlot(2), makePlot(3), makePlot(4)];
    const unregisters = plots.map((plot) => registerLivePlot(plot));
    expect(plots.every((plot) => !plot.released)).toBe(true);
    unregisters.forEach((unregister) => unregister());
  });

  it('releases the oldest invisible plot once more than 4 are registered', () => {
    const plots = [makePlot(1), makePlot(2), makePlot(3), makePlot(4), makePlot(5)];
    const unregisters = plots.map((plot) => registerLivePlot(plot));
    expect(plots[0]?.released).toBe(true);
    expect(plots.slice(1).every((plot) => !plot.released)).toBe(true);
    unregisters.forEach((unregister) => unregister());
  });

  it('never releases a visible plot even if it is the oldest', () => {
    const oldestVisible = makePlot(1, true);
    const plots = [oldestVisible, makePlot(2), makePlot(3), makePlot(4), makePlot(5)];
    const unregisters = plots.map((plot) => registerLivePlot(plot));
    expect(oldestVisible.released).toBe(false);
    expect(plots[1]?.released).toBe(true);
    unregisters.forEach((unregister) => unregister());
  });

  it('does nothing when all remaining plots are visible', () => {
    const plots = [
      makePlot(1, true),
      makePlot(2, true),
      makePlot(3, true),
      makePlot(4, true),
      makePlot(5, true),
    ];
    const unregisters = plots.map((plot) => registerLivePlot(plot));
    expect(plots.every((plot) => !plot.released)).toBe(true);
    unregisters.forEach((unregister) => unregister());
  });

  it('removes a plot from the set on unregister', () => {
    const plot = makePlot(1);
    const unregister = registerLivePlot(plot);
    unregister();
    const overflow = [makePlot(2), makePlot(3), makePlot(4), makePlot(5)];
    const unregisters = overflow.map((p) => registerLivePlot(p));
    expect(plot.released).toBe(false);
    releaseOverflow();
    unregisters.forEach((u) => u());
  });
});
