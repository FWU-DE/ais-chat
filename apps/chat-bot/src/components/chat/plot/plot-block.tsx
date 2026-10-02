'use client';

import { createContext, useContext, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { PlotError } from './plot-error';
import { PlotErrorBoundary } from './plot-error-boundary';
import { parsePlotSpec } from './plot-spec';

const JsxGraphPlot = dynamic(() => import('./jsxgraph-plot'), { ssr: false });

export const PlotStreamingContext = createContext(false);

export function PlotBlock({ source, title }: { source: string; title?: string }) {
  const parsed = useMemo(() => parsePlotSpec(source), [source]);

  const isStreaming = useContext(PlotStreamingContext);
  const tCommon = useTranslations('common');

  if (parsed === undefined) {
    return isStreaming ? (
      <div
        role="status"
        aria-busy="true"
        className="my-2 flex h-40 w-[42rem] max-w-full animate-pulse items-center justify-center whitespace-normal break-words rounded-lg border bg-muted px-4 text-center font-sans text-sm text-muted-foreground"
      >
        {title ?? tCommon('plot-label')}
      </div>
    ) : (
      <PlotError />
    );
  }

  return (
    <PlotErrorBoundary key={source}>
      <JsxGraphPlot spec={parsed} title={title} />
    </PlotErrorBoundary>
  );
}
