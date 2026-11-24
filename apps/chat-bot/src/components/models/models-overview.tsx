import { getTranslations } from 'next-intl/server';

import { EuFlagIcon } from '../icons/eu-flag-icon';
import { ModelsTable } from './models-table';

export async function ModelsOverview() {
  const t = await getTranslations('models');

  return (
    <>
      <h1 className="mb-6 text-3xl">{t('title')}</h1>
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-secondary bg-secondary/35 px-6 py-4 text-base">
        <EuFlagIcon className="h-4 w-6 shrink-0" />
        <p>{t('eu-banner')}</p>
      </div>
      <ModelsTable />
    </>
  );
}
