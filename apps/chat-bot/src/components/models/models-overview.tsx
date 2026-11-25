import EU from 'country-flag-icons/react/3x2/EU';
import { getTranslations } from 'next-intl/server';

import { ModelsTable } from './models-table';

export async function ModelsOverview() {
  const t = await getTranslations('models');

  return (
    <>
      <h1 className="mb-6 text-3xl">{t('title')}</h1>
      <div className="flex min-h-16 flex-col items-start px-6 pt-3 pb-4 text-base rounded-xl bg-secondary/30 sm:flex-row sm:items-center gap-4 mb-4">
        <EU className="h-5 w-8 shrink-0 rounded-sm" aria-hidden />
        <p className="whitespace-pre-line">{t('eu-banner')}</p>
      </div>
      <div className="pb-6">
        <ModelsTable />
      </div>
    </>
  );
}
