import { isWebSearchAvailableForFederalState } from '@/app/api/chat/websearch';
import { resolveSpeechAvailability } from '@shared/speech/speech-availability';
import { requireAuth } from '@/auth/requireAuth';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';
import { getAssistantByUser } from '@shared/assistants/assistant-service';
import { AssistantView } from './assistant-view';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

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

  const { isSpeechAvailable } = await resolveSpeechAvailability(federalState.featureToggles);

  return (
    <DefaultPageLayout>
      <AssistantView
        assistant={assistant}
        fileMappings={fileMappings}
        pictureUrl={pictureUrl}
        isWebSearchAvailable={isWebSearchAvailableForFederalState(federalState.featureToggles)}
        isSpeechAvailable={isSpeechAvailable}
      />
    </DefaultPageLayout>
  );
}
