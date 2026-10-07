'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import JXG from 'jsxgraph';
import { logError, logWarning } from '@shared/logging/logging';
import { applyInteractionOptions, createBoard, type ViewState } from './jsxgraph-board';
import { PlotFrame } from './plot-frame';
import { getSliderDefinitions, type PlotSpec } from '@/utils/plot/plot-spec';

export default function JsxGraphPlot({ spec, title }: { spec: PlotSpec; title?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewStateRef = useRef<ViewState | undefined>(undefined);
  const setSliderRef = useRef<((index: number, value: number) => void) | undefined>(undefined);
  const boardRef = useRef<JXG.Board | undefined>(undefined);
  const frameRef = useRef<number | null>(null);
  const discardViewRef = useRef(false);
  const sliders = useMemo(() => getSliderDefinitions(spec.elements), [spec]);
  const [sliderValues, setSliderValues] = useState(() =>
    sliders.map((slider) => slider?.start ?? 0),
  );
  const sliderValuesRef = useRef(sliderValues);
  const [resetCount, setResetCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // A new spec invalidates the remembered view. Declared before the board effect so it runs first.
  useEffect(() => {
    viewStateRef.current = undefined;
  }, [spec]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
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
      isFullscreen,
    );
    setSliderRef.current = setSlider;
    boardRef.current = board;

    const resizeObserver = new ResizeObserver(() => {
      if (boardDiv.clientWidth > 0 && boardDiv.clientHeight > 0) {
        board.resizeContainer(boardDiv.clientWidth, boardDiv.clientHeight, true);
      }
    });
    resizeObserver.observe(boardDiv);

    return () => {
      resizeObserver.disconnect();
      setSliderRef.current = undefined;
      boardRef.current = undefined;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      try {
        viewStateRef.current = discardViewRef.current ? undefined : capture();
      } catch (error) {
        logWarning('Plot view state could not be captured', { error });
        viewStateRef.current = undefined;
      }
      discardViewRef.current = false;
      JXG.JSXGraph.freeBoard(board);
      container.replaceChildren();
    };
    // isFullscreen is read for the initial pan/zoom options only; the sync effect below handles changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, resetCount]);

  // Keep pan/zoom interaction options in sync without rebuilding the board.
  useEffect(() => {
    const board = boardRef.current;
    if (board === undefined) {
      return;
    }
    applyInteractionOptions(board, spec, isFullscreen);
  }, [spec, isFullscreen, resetCount]);

  // Overlay fullscreen: the page behind must not scroll, and Escape closes it.
  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

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
      try {
        sliderValuesRef.current.forEach((current, i) => setSliderRef.current?.(i, current));
      } catch (error) {
        logError('Plot slider update failed', error, { title });
      }
    });
  }

  function handleZoomIn() {
    try {
      boardRef.current?.zoomIn();
    } catch (error) {
      logError('Plot zoom in failed', error, { title });
    }
  }

  function handleZoomOut() {
    try {
      boardRef.current?.zoomOut();
    } catch (error) {
      logError('Plot zoom out failed', error, { title });
    }
  }

  return (
    <PlotFrame
      title={title}
      containerRef={containerRef}
      sliders={sliders}
      sliderValues={sliderValues}
      onSliderChange={handleSliderChange}
      onReset={handleReset}
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      isFullscreen={isFullscreen}
      onToggleFullscreen={() => setIsFullscreen((current) => !current)}
    />
  );
}
