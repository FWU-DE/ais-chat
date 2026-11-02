import { describe, expect, it } from 'vitest';
import {
  activateAllLivePlots,
  registerLivePlot,
  releaseOverflow,
  retainLivePlot,
  type LivePlot,
} from './live-plots';

function makePlot(
  lastSeen: number,
  isVisible = false,
): LivePlot & { activated: boolean; released: boolean } {
  const plot = {
    isVisible,
    lastSeen,
    activated: false,
    released: false,
    activate() {
      plot.activated = true;
    },
    release() {
      plot.released = true;
    },
  };
  return plot;
}

describe('registerLivePlot / releaseOverflow', () => {
  it('does not retain inactive plots when registering them', () => {
    const plots = [makePlot(1), makePlot(2), makePlot(3), makePlot(4), makePlot(5)];
    const unregisters = plots.map((plot) => registerLivePlot(plot));
    expect(plots.every((plot) => !plot.released)).toBe(true);
    unregisters.forEach((unregister) => unregister());
  });

  it('keeps up to 4 plots without releasing any', () => {
    const plots = [makePlot(1), makePlot(2), makePlot(3), makePlot(4)];
    const unregisters = plots.map((plot) => registerLivePlot(plot));
    plots.forEach((plot) => retainLivePlot(plot));
    expect(plots.every((plot) => !plot.released)).toBe(true);
    unregisters.forEach((unregister) => unregister());
  });

  it('releases the oldest invisible plot once more than 4 are registered', () => {
    const plots = [makePlot(1), makePlot(2), makePlot(3), makePlot(4), makePlot(5)];
    const unregisters = plots.map((plot) => registerLivePlot(plot));
    plots.forEach((plot) => retainLivePlot(plot));
    expect(plots[0]?.released).toBe(true);
    expect(plots.slice(1).every((plot) => !plot.released)).toBe(true);
    unregisters.forEach((unregister) => unregister());
  });

  it('never releases a visible plot even if it is the oldest', () => {
    const oldestVisible = makePlot(1, true);
    const plots = [oldestVisible, makePlot(2), makePlot(3), makePlot(4), makePlot(5)];
    const unregisters = plots.map((plot) => registerLivePlot(plot));
    plots.forEach((plot) => retainLivePlot(plot));
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
    plots.forEach((plot) => retainLivePlot(plot));
    expect(plots.every((plot) => !plot.released)).toBe(true);
    unregisters.forEach((unregister) => unregister());
  });

  it('removes a plot from the set on unregister', () => {
    const plot = makePlot(1);
    const unregister = registerLivePlot(plot);
    retainLivePlot(plot);
    unregister();
    const overflow = [makePlot(2), makePlot(3), makePlot(4), makePlot(5)];
    const unregisters = overflow.map((p) => registerLivePlot(p));
    overflow.forEach((p) => retainLivePlot(p));
    expect(plot.released).toBe(false);
    releaseOverflow();
    unregisters.forEach((u) => u());
  });
});

describe('activateAllLivePlots', () => {
  it('activates released plots and restores the previous live state', () => {
    const plots = [makePlot(1), makePlot(2), makePlot(3), makePlot(4), makePlot(5)];
    const unregisters = plots.map((plot) => registerLivePlot(plot));
    plots.forEach((plot) => retainLivePlot(plot));
    const releasedPlot = plots[0]!;
    releasedPlot.released = false;

    const restore = activateAllLivePlots();
    expect(releasedPlot.activated).toBe(true);
    restore();
    expect(releasedPlot.released).toBe(true);

    unregisters.forEach((unregister) => unregister());
  });

  it('restores the original state only after overlapping exports finish', () => {
    const plot = makePlot(1);
    const unregister = registerLivePlot(plot);

    const restoreFirst = activateAllLivePlots();
    const restoreSecond = activateAllLivePlots();
    restoreFirst();
    expect(plot.released).toBe(false);

    restoreSecond();
    expect(plot.released).toBe(true);
    unregister();
  });

  it('does not evict temporarily retained plots during export', () => {
    const plots = [makePlot(1), makePlot(2), makePlot(3), makePlot(4), makePlot(5)];
    const unregisters = plots.map((plot) => registerLivePlot(plot));
    const restore = activateAllLivePlots();

    releaseOverflow();
    expect(plots.every((plot) => !plot.released)).toBe(true);

    restore();
    expect(plots.every((plot) => plot.released)).toBe(true);
    unregisters.forEach((unregister) => unregister());
  });

  it('preserves a plot that becomes visible during export', () => {
    const plot = makePlot(1);
    const unregister = registerLivePlot(plot);
    const restore = activateAllLivePlots();

    plot.isVisible = true;
    retainLivePlot(plot);
    restore();

    expect(plot.isVisible).toBe(true);
    expect(plot.released).toBe(false);
    unregister();
  });
});
