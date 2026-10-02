'use client';

import { useTranslations } from 'next-intl';

export function PlotError() {
  const tCommon = useTranslations('common');

  return (
    <div
      role="alert"
      className="my-2 flex h-24 w-[42rem] max-w-full items-center justify-center whitespace-normal break-words rounded-lg border bg-muted px-3 text-center font-sans text-sm text-muted-foreground"
    >
      {tCommon('plot-error')}
    </div>
  );
}
