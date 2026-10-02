'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@ui/components/button';
import type { RefObject } from 'react';
import { ArrowCounterClockwiseIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { downloadPng } from './png-export';
import type { SliderDefinition } from './plot-spec';

export function PlotFrame({
  title,
  containerRef,
  sliders,
  sliderValues,
  onSliderChange,
  onReset,
}: {
  title?: string;
  containerRef: RefObject<HTMLDivElement | null>;
  sliders: (SliderDefinition | undefined)[];
  sliderValues: number[];
  onSliderChange: (index: number, value: number) => void;
  onReset: () => void;
}) {
  const tCommon = useTranslations('common');

  return (
    <figure className="my-2 flex w-[42rem] max-w-full flex-col gap-2 whitespace-normal break-words rounded-lg border bg-white p-3 font-sans">
      {title && <figcaption className="font-sans font-semibold">{title}</figcaption>}
      <div
        ref={containerRef}
        role="img"
        aria-label={title ?? tCommon('plot-label')}
        className="h-80 w-full overflow-hidden"
      />
      {sliders.map((slider, index) =>
        slider === undefined ? null : (
          <label key={index} className="flex items-center gap-2 text-sm">
            <span className="min-w-24 shrink-0 font-mono tabular-nums">
              {slider.name} = {sliderValues[index]?.toFixed(2)}
            </span>
            <input
              type="range"
              className="grow accent-primary"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={sliderValues[index] ?? slider.start}
              onChange={(event) => onSliderChange(index, Number(event.target.value))}
            />
          </label>
        ),
      )}
      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={tCommon('plot-download-png')}
          aria-label={tCommon('plot-download-png')}
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
          title={tCommon('plot-reset')}
          aria-label={tCommon('plot-reset')}
          className="text-primary"
          onClick={onReset}
        >
          <ArrowCounterClockwiseIcon className="size-5 text-primary" />
        </Button>
      </div>
    </figure>
  );
}
