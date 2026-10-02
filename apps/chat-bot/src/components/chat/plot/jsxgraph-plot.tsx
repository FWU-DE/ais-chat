'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import JXG from 'jsxgraph';
import { createBoard, type ViewState } from './jsxgraph-board';
import { registerLivePlot, releaseOverflow, type LivePlot } from './live-plots';
import { PlotFrame } from './plot-frame';
import { getSliderDefinitions, type PlotSpec } from './plot-spec';

const ACTIVATE_DELAY_MS = 150;

export default function JsxGraphPlot({ spec, title }: { spec: PlotSpec; title?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewStateRef = useRef<ViewState | undefined>(undefined);
  const setSliderRef = useRef<((index: number, value: number) => void) | undefined>(undefined);
  const frameRef = useRef<number | null>(null);
  const discardViewRef = useRef(false);
  const sliders = useMemo(() => getSliderDefinitions(spec.elements), [spec]);
  const [sliderValues, setSliderValues] = useState(() =>
    sliders.map((slider) => slider?.start ?? 0),
  );
  const sliderValuesRef = useRef(sliderValues);
  const [isActive, setIsActive] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const [livePlot] = useState<LivePlot>(() => ({
    isVisible: false,
    lastSeen: 0,
    release: () => setIsActive(false),
  }));

  // Boards are expensive: build them shortly after the plot scrolls into view and drop
  // the least recently seen ones once more than a few are alive.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        livePlot.isVisible = entry?.isIntersecting === true;
        livePlot.lastSeen = Date.now();
        clearTimeout(timer);
        if (livePlot.isVisible) {
          timer = setTimeout(() => setIsActive(true), ACTIVATE_DELAY_MS);
        } else {
          releaseOverflow();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(container);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [livePlot]);

  // A new spec invalidates the remembered view. Declared before the board effect so it runs first.
  useEffect(() => {
    viewStateRef.current = undefined;
  }, [spec]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || !isActive) {
      return;
    }

    const boardDiv = document.createElement('div');
    boardDiv.style.width = '100%';
    boardDiv.style.height = '100%';
    container.replaceChildren(boardDiv);

    // Errors bubble up to the error boundary around the plot.
    const { board, capture, setSlider } = createBoard(
      boardDiv,
      spec,
      viewStateRef.current,
      sliderValuesRef.current,
    );
    setSliderRef.current = setSlider;
    const unregister = registerLivePlot(livePlot);

    return () => {
      setSliderRef.current = undefined;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      try {
        viewStateRef.current = discardViewRef.current ? undefined : capture();
      } catch {
        viewStateRef.current = undefined;
      }
      discardViewRef.current = false;
      unregister();
      JXG.JSXGraph.freeBoard(board);
      container.replaceChildren();
    };
  }, [spec, isActive, livePlot, resetCount]);

  // Rebuilds the board from the spec: view, slider values and dragged elements are reset.
  function handleReset() {
    const defaults = sliders.map((slider) => slider?.start ?? 0);
    sliderValuesRef.current = defaults;
    setSliderValues(defaults);
    viewStateRef.current = undefined;
    discardViewRef.current = true;
    setResetCount((count) => count + 1);
  }

  function handleSliderChange(index: number, value: number) {
    const next = sliderValuesRef.current.map((current, i) => (i === index ? value : current));
    sliderValuesRef.current = next;
    setSliderValues(next);
    if (frameRef.current !== null) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      sliderValuesRef.current.forEach((current, i) => setSliderRef.current?.(i, current));
    });
  }

  return (
    <PlotFrame
      title={title}
      containerRef={containerRef}
      sliders={sliders}
      sliderValues={sliderValues}
      onSliderChange={handleSliderChange}
      onReset={handleReset}
    />
  );
}
