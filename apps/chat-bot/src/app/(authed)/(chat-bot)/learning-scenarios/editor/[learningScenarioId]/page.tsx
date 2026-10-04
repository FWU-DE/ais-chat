import { requireAuth } from '@/auth/requireAuth';
import { isWebSearchAvailableForFederalState } from '@/app/api/chat/websearch';
import { getLearningScenarioForEditView } from '@shared/learning-scenarios/learning-scenario-service';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';
import { WebSource } from '@shared/db/types';
import { LearningScenarioEdit } from './learning-scenario-edit';
import { redirect } from 'next/navigation';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('learning-scenarios.page-titles');
  return {
    title: t('edit'),
  };
}

export default async function Page(
  props: PageProps<'/learning-scenarios/editor/[learningScenarioId]'>,
) {
  const { learningScenarioId } = await props.params;
  const { user, federalState } = await requireAuth();

  const {
    learningScenario,
    relatedFiles,
    avatarPictureUrl,
    maxBudget,
    usedBudget,
    budgetUsedBySharedChat,
  } = await getLearningScenarioForEditView({
    learningScenarioId: learningScenarioId,
    user,
    federalState,
  }).catch(handleErrorInServerComponent);

  const readOnly = user.id !== learningScenario.userId;

  if (readOnly) {
    redirect(`/learning-scenarios/${learningScenarioId}`);
  }

  const initialLinks = learningScenario.attachedLinks
    .filter((l) => l && l !== '')
    .map(
      (url) =>
        ({
          link: url,
          error: false,
        }) as WebSource,
    );

  return (
    <DefaultPageLayout layoutConfig={{ layout: 'form' }}>
      <LearningScenarioEdit
        learningScenario={learningScenario}
        relatedFiles={relatedFiles}
        initialLinks={initialLinks}
        avatarPictureUrl={avatarPictureUrl}
        usedBudget={usedBudget ?? 0}
        maxBudget={maxBudget ?? 500}
        budgetUsedBySharedChat={budgetUsedBySharedChat}
        isWebSearchAvailable={isWebSearchAvailableForFederalState(federalState.featureToggles)}
        isSpeechAvailable={federalState.featureToggles.isSpeechModelEnabled === true}
      />
    </DefaultPageLayout>
  );
}
