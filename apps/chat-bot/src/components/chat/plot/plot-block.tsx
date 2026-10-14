'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { logError } from '@shared/logging/logging';
import { PlotError } from './plot-error';
import { PlotErrorBoundary } from './plot-error-boundary';
import { parsePlotSpec } from '@/utils/plot/plot-spec';

const JsxGraphPlot = dynamic(() => import('./jsxgraph-plot'), { ssr: false });

export const PlotStreamingContext = createContext(false);

// Effects run twice in dev and blocks remount, so log each broken source only once.
const loggedSources = new Set<string>();

export function PlotBlock({ source, title }: { source: string; title?: string }) {
  const result = useMemo(() => parsePlotSpec(source), [source]);
  const parseError = 'error' in result ? result.error : undefined;

  const isStreaming = useContext(PlotStreamingContext);
  const tCommon = useTranslations('common');

  useEffect(() => {
    if (parseError !== undefined && !isStreaming && !loggedSources.has(source)) {
      loggedSources.add(source);
      logError('Plot spec could not be parsed', parseError, { source });
    }
  }, [parseError, isStreaming, title, source]);

  if ('error' in result) {
    return isStreaming ? (
      <div
        role="status"
        aria-busy="true"
        className="my-2 flex h-40 w-full min-w-64 max-w-2xl animate-pulse items-center justify-center wrap-break-word rounded-lg border bg-muted px-4 text-center text-sm text-muted-foreground"
      >
        {title ?? tCommon('plot.label')}
      </div>
    ) : (
      <PlotError />
    );
  }

  return (
    <PlotErrorBoundary key={source} title={title}>
      <JsxGraphPlot spec={result.spec} title={title} />
    </PlotErrorBoundary>
  );
}

// Rendered for the `<jsxgraph-plot>` element produced by the rehype-jsxgraph-plot plugin.
// `incomplete` is true while the fence's opening line is still streaming in, in which case
// nothing is rendered yet to avoid flashing a partially parsed block.
export function JsxGraphPlotElement({
  source,
  title,
  incomplete,
}: {
  source: string;
  title?: string;
  incomplete?: boolean;
}) {
  if (incomplete) {
    return null;
  }
  return <PlotBlock source={source} title={title} />;
}
