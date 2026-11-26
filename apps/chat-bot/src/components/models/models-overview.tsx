import { Alert, AlertDescription, AlertIcon } from '@ui/components/alert';
import EU from 'country-flag-icons/react/3x2/EU';
import { getTranslations } from 'next-intl/server';

import { ModelsTable } from './models-table';

export async function ModelsOverview() {
  const t = await getTranslations('models');

  return (
    <>
      <h1 className="mb-6 text-3xl">{t('title')}</h1>
      <Alert className="mb-4">
        <AlertIcon>
          <EU className="h-5 w-8 rounded-sm" />
        </AlertIcon>
        <AlertDescription className="whitespace-pre-line">{t('eu-banner')}</AlertDescription>
      </Alert>
      <div className="pb-6">
        <ModelsTable />
      </div>
    </>
  );
}
