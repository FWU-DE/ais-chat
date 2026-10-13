'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ui/components/dialog';
import { Slider } from '@ui/components/slider';
import type { Ref } from 'react';
import {
  ArrowCounterClockwiseIcon,
  CornersOutIcon,
  DownloadSimpleIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from '@phosphor-icons/react';
import { downloadPng } from './png-export';
import type { SliderDefinition } from './slider-definitions';

// Displays as many decimals as the step actually carries, so fine-grained sliders (e.g. step
// `0.0001`) show distinct values, and non-power-of-ten steps (e.g. `0.25`) aren't rounded away.
function decimalPlaces(step: number) {
  // Division (e.g. `(max - min) / 100`) can produce steps like `0.028999999999999998` that are
  // really meant to be `0.029`. A tolerance (rather than an exact match, or rounding the input to
  // a fixed number of significant digits) distinguishes that floating-point noise from genuine
  // fractional precision regardless of the step's magnitude. The tolerance is derived from
  // `Number.EPSILON` and scaled to the current magnitude (rather than a fixed absolute value),
  // so tiny steps (e.g. `1e-9`) aren't mistaken for noise.
  const EPSILON_MULTIPLIER = 8;
  let decimals = 0;
  let factor = 1;
  let scaled = step * factor;
  while (
    Math.abs(Math.round(scaled) - scaled) >
      Math.abs(scaled) * Number.EPSILON * EPSILON_MULTIPLIER &&
    decimals < 10
  ) {
    factor *= 10;
    decimals++;
    scaled = step * factor;
  }
  return decimals;
}

export function formatSliderValue(value: number, step: number) {
  return value.toFixed(decimalPlaces(step));
}

function PlotSliders({
  sliders,
  sliderValues,
  onSliderChange,
}: {
  sliders: SliderDefinition[];
  sliderValues: number[];
  onSliderChange: (index: number, value: number) => void;
}) {
  if (sliders.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {sliders.map((slider, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <span className="min-w-24 shrink-0 font-mono tabular-nums">
            {slider.name} = {formatSliderValue(sliderValues[index] ?? slider.start, slider.step)}
          </span>
          <Slider
            data-testid={`plot-slider-${index}`}
            className="grow"
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={[sliderValues[index] ?? slider.start]}
            onValueChange={([value]) => {
              if (value !== undefined) onSliderChange(index, value);
            }}
          />
        </div>
      ))}
    </div>
  );
}

function PlotActions({
  container,
  onReset,
  onZoomIn,
  onZoomOut,
}: {
  container: HTMLDivElement | null;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const tCommon = useTranslations('common');

  return (
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
          const svg = container?.querySelector('svg');
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
  );
}

export function PlotFrame({
  title,
  containerRef,
  container,
  sliders,
  sliderValues,
  onSliderChange,
  onReset,
  onZoomIn,
  onZoomOut,
  isFullscreen,
  onFullscreenChange,
}: {
  title?: string;
  containerRef: Ref<HTMLDivElement>;
  container: HTMLDivElement | null;
  sliders: SliderDefinition[];
  sliderValues: number[];
  onSliderChange: (index: number, value: number) => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  isFullscreen: boolean;
  onFullscreenChange: (open: boolean) => void;
}) {
  const tCommon = useTranslations('common');
  const plotLabel = title ?? tCommon('plot.label');

  return (
    <figure className="my-2 flex w-full min-w-64 max-w-2xl flex-col gap-2 wrap-break-word rounded-lg border bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <figcaption className="font-semibold">{plotLabel}</figcaption>
        <Dialog open={isFullscreen} onOpenChange={onFullscreenChange}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={tCommon('plot.fullscreen')}
              aria-label={tCommon('plot.fullscreen')}
              aria-pressed={isFullscreen}
              data-testid="plot-fullscreen-toggle"
              className="-mt-1 shrink-0 text-primary"
            >
              <CornersOutIcon className="size-5 text-primary" />
            </Button>
          </DialogTrigger>
          <DialogContent variant="lg" showCloseButton aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">{plotLabel}</DialogTitle>
            </DialogHeader>
            <div
              ref={isFullscreen ? containerRef : undefined}
              aria-label={plotLabel}
              data-testid={isFullscreen ? 'plot-view' : undefined}
              className="w-full min-h-[60%] flex-1 overflow-hidden [&_svg]:font-[inherit]"
            />
            <div className="min-h-0 flex-1 shrink overflow-y-auto">
              <PlotSliders
                sliders={sliders}
                sliderValues={sliderValues}
                onSliderChange={onSliderChange}
              />
            </div>
            <PlotActions
              container={container}
              onReset={onReset}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div
        ref={isFullscreen ? undefined : containerRef}
        aria-label={plotLabel}
        data-testid={isFullscreen ? undefined : 'plot-view'}
        className="h-80 w-full overflow-hidden [&_svg]:font-[inherit]"
      />
      <PlotSliders sliders={sliders} sliderValues={sliderValues} onSliderChange={onSliderChange} />
      <PlotActions
        container={container}
        onReset={onReset}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />
    </figure>
  );
}
