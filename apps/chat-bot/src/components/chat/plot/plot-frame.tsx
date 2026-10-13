'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@ui/components/button';
import type { RefObject } from 'react';
import {
  ArrowCounterClockwiseIcon,
  CornersInIcon,
  CornersOutIcon,
  DownloadSimpleIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from '@phosphor-icons/react';
import { cn } from '@/utils/tailwind';
import { downloadPng } from './png-export';
import type { SliderDefinition } from './slider-definitions';

// Displays as many decimals as the step actually carries, so fine-grained sliders (e.g. step
// `0.0001`) show distinct values, and non-power-of-ten steps (e.g. `0.25`) aren't rounded away.
function decimalPlaces(step: number) {
  let decimals = 0;
  let factor = 1;
  while (Math.round(step * factor) / factor !== step && decimals < 10) {
    factor *= 10;
    decimals++;
  }
  return decimals;
}

export function formatSliderValue(value: number, step: number) {
  return value.toFixed(decimalPlaces(step));
}

export function PlotFrame({
  title,
  containerRef,
  sliders,
  sliderValues,
  onSliderChange,
  onReset,
  onZoomIn,
  onZoomOut,
  isFullscreen,
  onToggleFullscreen,
}: {
  title?: string;
  containerRef: RefObject<HTMLDivElement | null>;
  sliders: SliderDefinition[];
  sliderValues: number[];
  onSliderChange: (index: number, value: number) => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const tCommon = useTranslations('common');
  const fullscreenLabel = isFullscreen
    ? tCommon('plot.fullscreen-exit')
    : tCommon('plot.fullscreen');

  return (
    <>
      {/* Fullscreen takes the figure out of flow; this invisible twin keeps its normal-mode
          footprint reserved so surrounding text doesn't jump while the overlay animates in. */}
      {isFullscreen && (
        <figure
          aria-hidden
          className="invisible my-2 flex w-full min-w-64 max-w-2xl flex-col gap-2 p-3"
        >
          {title ? <figcaption className="font-semibold">{title}</figcaption> : <span />}
          <div className="h-80 w-full" />
          {sliders.map((_, index) => (
            <div key={index} className="h-6 w-full" />
          ))}
          <div className="h-7 w-full" />
        </figure>
      )}
      {/* Decorative backdrop; Escape already closes fullscreen for keyboard users. */}
      <div
        role="presentation"
        className={cn(
          'fixed inset-0 z-50 bg-black/10 opacity-0 transition-opacity duration-150 supports-backdrop-filter:backdrop-blur-xs',
          isFullscreen ? 'opacity-100' : 'pointer-events-none',
        )}
        onClick={onToggleFullscreen}
      />
      <figure
        className={cn(
          'my-2 flex w-full min-w-64 max-w-2xl flex-col gap-2 wrap-break-word rounded-lg border bg-white p-3',
          isFullscreen &&
            'fixed inset-4 z-50 m-0 w-auto max-w-none animate-in shadow-lg duration-150 fade-in-0 zoom-in-95 sm:inset-8',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          {title ? <figcaption className="font-semibold">{title}</figcaption> : <span />}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
            aria-pressed={isFullscreen}
            data-testid="plot-fullscreen-toggle"
            className="-mt-1 shrink-0 text-primary"
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? (
              <CornersInIcon className="size-5 text-primary" />
            ) : (
              <CornersOutIcon className="size-5 text-primary" />
            )}
          </Button>
        </div>
        <div
          ref={containerRef}
          aria-label={title ?? tCommon('plot.label')}
          data-testid="plot-view"
          className={cn(
            'w-full overflow-hidden [&_svg]:font-[inherit]',
            isFullscreen ? 'min-h-0 flex-1' : 'h-80',
          )}
        />
        {sliders.length > 0 && (
          <div
            className={cn(
              'flex flex-col gap-2',
              isFullscreen && 'max-h-64 shrink-0 overflow-y-auto',
            )}
          >
            {sliders.map((slider, index) => (
              <label key={index} className="flex items-center gap-2 text-sm">
                <span className="min-w-24 shrink-0 font-mono tabular-nums">
                  {slider.name} ={' '}
                  {formatSliderValue(sliderValues[index] ?? slider.start, slider.step)}
                </span>
                <input
                  type="range"
                  data-testid={`plot-slider-${index}`}
                  className="grow accent-primary"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={sliderValues[index] ?? slider.start}
                  onChange={(event) => onSliderChange(index, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={tCommon('plot.zoom-in')}
            aria-label={tCommon('plot.zoom-in')}
            className="text-primary"
            onClick={onZoomIn}
          >
            <MagnifyingGlassPlusIcon className="size-5 text-primary" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={tCommon('plot.zoom-out')}
            aria-label={tCommon('plot.zoom-out')}
            className="text-primary"
            onClick={onZoomOut}
          >
            <MagnifyingGlassMinusIcon className="size-5 text-primary" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={tCommon('plot.download-png')}
            aria-label={tCommon('plot.download-png')}
            data-testid="plot-download-png"
            className="text-primary"
            onClick={() => {
              const svg = containerRef.current?.querySelector('svg');
              if (svg !== null && svg !== undefined) downloadPng(svg, 'graph');
            }}
          >
            <DownloadSimpleIcon className="size-5 text-primary" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={tCommon('plot.reset')}
            aria-label={tCommon('plot.reset')}
            data-testid="plot-reset"
            className="text-primary"
            onClick={onReset}
          >
            <ArrowCounterClockwiseIcon className="size-5 text-primary" />
          </Button>
        </div>
      </figure>
    </>
  );
}
