'use client';

import { useTranslations } from 'next-intl';

export function PlotError() {
  const tCommon = useTranslations('common');

  return (
    <div
      role="alert"
      data-testid="plot-error"
      className="my-2 flex h-24 w-full min-w-64 max-w-2xl items-center justify-center wrap-break-word rounded-lg border bg-muted px-3 text-center text-sm text-muted-foreground"
    >
      {tCommon('plot.error')}
    </div>
  );
}
