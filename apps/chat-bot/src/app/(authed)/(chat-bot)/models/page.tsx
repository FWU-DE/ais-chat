import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { getDefaultModelNameByFederalStateId } from '@shared/llm-models/llm-model-service';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireAuth } from '@/auth/requireAuth';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { ModelsOverview } from '@/components/models/models-overview';
import { LlmModelsProvider } from '@/components/providers/llm-model-provider';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('models');
  return {
    title: t('page-title'),
  };
}

export default async function Page() {
  const { user, federalState } = await requireAuth();
  const models = await dbGetLlmModelsByFederalStateId({ federalStateId: federalState.id });
  const defaultModelName = await getDefaultModelNameByFederalStateId(federalState.id, models);

  return (
    <LlmModelsProvider
      models={models}
      initialModelName={user.lastUsedModel ?? defaultModelName}
      defaultModelName={defaultModelName}
    >
      <DefaultPageLayout>
        <ModelsOverview />
      </DefaultPageLayout>
    </LlmModelsProvider>
  );
}
