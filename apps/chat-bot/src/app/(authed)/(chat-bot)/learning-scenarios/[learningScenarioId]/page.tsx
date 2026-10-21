import { requireAuth } from '@/auth/requireAuth';
import { isWebSearchAvailableForFederalState } from '@/app/api/chat/websearch';
import { resolveSpeechAvailability } from '@shared/speech/speech-availability';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';
import { getLearningScenarioForEditView } from '@shared/learning-scenarios/learning-scenario-service';
import { LearningScenarioView } from './learning-scenario-view';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

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

  const {
    learningScenario,
    relatedFiles,
    avatarPictureUrl,
    maxBudget,
    usedBudget,
    budgetUsedBySharedChat,
  } = await getLearningScenarioForEditView({
    learningScenarioId,
    user,
    federalState,
  }).catch(handleErrorInServerComponent);

  const initialLinks = learningScenario.attachedLinks.map((url) => ({ link: url }));

  const { isSpeechAvailable } = await resolveSpeechAvailability(federalState.featureToggles);

  return (
    <DefaultPageLayout>
      <LearningScenarioView
        learningScenario={learningScenario}
        fileMappings={relatedFiles}
        pictureUrl={avatarPictureUrl}
        initialLinks={initialLinks}
        usedBudget={usedBudget ?? 0}
        maxBudget={maxBudget ?? 500}
        budgetUsedBySharedChat={budgetUsedBySharedChat}
        isWebSearchAvailable={isWebSearchAvailableForFederalState(federalState.featureToggles)}
        isSpeechAvailable={isSpeechAvailable}
      />
    </DefaultPageLayout>
  );
}
