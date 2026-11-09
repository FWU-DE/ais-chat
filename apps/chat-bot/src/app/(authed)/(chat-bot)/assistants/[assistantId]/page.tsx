import { getAssistantByUser } from '@shared/assistants/assistant-service';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { isWebSearchAvailableForFederalState } from '@/app/api/chat/websearch';
import { requireAuth } from '@/auth/requireAuth';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';

import { AssistantView } from './assistant-view';
import { prepareAssistantForView } from './assistant-view-access';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('assistants.page-titles');
  return {
    title: t('view'),
  };
}

export default async function Page(props: PageProps<'/assistants/[assistantId]'>) {
  const { assistantId } = await props.params;
  const { user, federalState } = await requireAuth();

  const { assistant, fileMappings, pictureUrl } = await getAssistantByUser({
    assistantId: assistantId,
    user,
  }).catch(handleErrorInServerComponent);

  return (
    <DefaultPageLayout>
      <AssistantView
        assistant={prepareAssistantForView(assistant, user.userRole)}
        fileMappings={fileMappings}
        pictureUrl={pictureUrl}
        isWebSearchAvailable={isWebSearchAvailableForFederalState(federalState.featureToggles)}
        isSpeechAvailable={federalState.featureToggles.isSpeechModelEnabled === true}
      />
    </DefaultPageLayout>
  );
}
