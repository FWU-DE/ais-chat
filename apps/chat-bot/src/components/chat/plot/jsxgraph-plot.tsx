'use client';

import type { PlotSpec } from '@/utils/plot/plot-spec';
import { logError, logWarning } from '@shared/logging/logging';
import JXG from 'jsxgraph';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createBoard, type ViewState } from './jsxgraph-board';
import { registerLivePlot, releaseOverflow, retainLivePlot, type LivePlot } from './live-plots';
import { PlotFrame } from './plot-frame';
import { getSliderDefinitions } from './slider-definitions';

const ACTIVATE_DELAY_MS = 150;

export default function JsxGraphPlot({ spec, title }: { spec: PlotSpec; title?: string }) {
  // Callback ref: fullscreen moves the container between the inline figure and the dialog,
  // and the dialog's content mounts a render after it opens, so this reacts to the real node.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(node);
  }, []);
  const viewStateRef = useRef<ViewState | undefined>(undefined);
  const setSliderRef = useRef<((index: number, value: number) => void) | undefined>(undefined);
  const boardRef = useRef<JXG.Board | undefined>(undefined);
  const frameRef = useRef<number | null>(null);
  const discardViewRef = useRef(false);
  const sliders = useMemo(() => getSliderDefinitions(spec.elements), [spec]);
  const [sliderValues, setSliderValues] = useState(() => sliders.map((slider) => slider.start));
  const sliderValuesRef = useRef(sliderValues);
  const [isActive, setIsActive] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [livePlot] = useState<LivePlot>(() => ({
    isVisible: false,
    lastSeen: 0,
    activate: () => setIsActive(true),
    release: () => setIsActive(false),
  }));

  useEffect(() => registerLivePlot(livePlot), [livePlot]);

  // Boards are expensive: build them shortly after the plot scrolls into view and drop
  // the least recently seen ones once more than a few are alive.
  useEffect(() => {
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
          timer = setTimeout(() => {
            retainLivePlot(livePlot);
            setIsActive(true);
          }, ACTIVATE_DELAY_MS);
        } else {
          releaseOverflow();
        }
      },
      // The board activates/deactivates shortly before entering/after leaving the viewport, not exactly at its
      // edges, since IntersectionObserver expands the root box symmetrically.
      { rootMargin: '300px' },
    );
    observer.observe(container);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [livePlot, container]);

  // A new spec invalidates the remembered view. Declared before the board effect so it runs first.
  useEffect(() => {
    viewStateRef.current = undefined;
  }, [spec]);

  useEffect(() => {
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
    // Toggling fullscreen moves the board to a new container; view state survives via viewStateRef.
  }, [spec, isActive, livePlot, resetCount, container, isFullscreen]);

  // Rebuilds the board from the spec: view, slider values and dragged elements are reset.
  function handleReset() {
    const defaults = sliders.map((slider) => slider.start);
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
        logError('Plot slider update failed', error);
      }
    });
  }

  function handleZoomIn() {
    try {
      boardRef.current?.zoomIn();
    } catch (error) {
      logError('Plot zoom in failed', error);
    }
  }

  function handleZoomOut() {
    try {
      boardRef.current?.zoomOut();
    } catch (error) {
      logError('Plot zoom out failed', error);
    }
  }

  return (
    <PlotFrame
      title={title}
      containerRef={containerRef}
      container={container}
      sliders={sliders}
      sliderValues={sliderValues}
      onSliderChange={handleSliderChange}
      onReset={handleReset}
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      isFullscreen={isFullscreen}
      onFullscreenChange={setIsFullscreen}
    />
  );
}
