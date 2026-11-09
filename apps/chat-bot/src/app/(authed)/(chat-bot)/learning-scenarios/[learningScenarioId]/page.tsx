import { isFavorite } from '@shared/favorites/favorite-service';
import { getLearningScenarioForEditView } from '@shared/learning-scenarios/learning-scenario-service';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { isWebSearchAvailableForFederalState } from '@/app/api/chat/websearch';
import { requireAuth } from '@/auth/requireAuth';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';

import { LearningScenarioView } from './learning-scenario-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('learning-scenarios.page-titles');
  return {
    title: t('view'),
  };
}

export default async function Page(props: PageProps<'/learning-scenarios/[learningScenarioId]'>) {
  const { learningScenarioId } = await props.params;
  const { user, federalState } = await requireAuth();

  const [
    {
      learningScenario,
      relatedFiles,
      avatarPictureUrl,
      maxBudget,
      usedBudget,
      budgetUsedBySharedChat,
    },
    initialIsFavorite,
  ] = await Promise.all([
    getLearningScenarioForEditView({ learningScenarioId, user, federalState }).catch(
      handleErrorInServerComponent,
    ),
    isFavorite({ entityType: 'learningScenario', entityId: learningScenarioId, user }).catch(
      handleErrorInServerComponent,
    ),
  ]);

  const initialLinks = learningScenario.attachedLinks.map((url) => ({ link: url }));

  return (
    <DefaultPageLayout>
      <LearningScenarioView
        learningScenario={learningScenario}
        fileMappings={relatedFiles}
        pictureUrl={avatarPictureUrl}
        initialIsFavorite={initialIsFavorite}
        initialLinks={initialLinks}
        usedBudget={usedBudget ?? 0}
        maxBudget={maxBudget ?? 500}
        budgetUsedBySharedChat={budgetUsedBySharedChat}
        isWebSearchAvailable={isWebSearchAvailableForFederalState(federalState.featureToggles)}
        isSpeechAvailable={federalState.featureToggles.isSpeechModelEnabled === true}
      />
    </DefaultPageLayout>
  );
}
