import { isWebSearchAvailableForFederalState } from '@/app/api/chat/websearch';
import { requireAuth } from '@/auth/requireAuth';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';
import { getAssistantByUser } from '@shared/assistants/assistant-service';
import { getCommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';
import { AssistantEdit } from './assistant-edit';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('assistants.page-titles');
  return {
    title: t('edit'),
  };
}

export default async function Page(props: PageProps<'/assistants/editor/[assistantId]'>) {
  const { assistantId } = await props.params;
  const { user, federalState } = await requireAuth();

  const { assistant, fileMappings, pictureUrl } = await getAssistantByUser({
    assistantId: assistantId,
    user,
  }).catch(handleErrorInServerComponent);

  const communityTemplateRequest = await getCommunityTemplateRequestWithEvents({
    entityRef: { entityType: 'assistant', entityId: assistantId },
    user,
  }).catch(handleErrorInServerComponent);

  const initialLinks = assistant.attachedLinks
    .filter((l) => l !== '')
    .map((url) => ({ link: url }));

  return (
    <DefaultPageLayout layoutConfig={{ layout: 'form' }}>
      <AssistantEdit
        assistant={assistant}
        relatedFiles={fileMappings}
        initialLinks={initialLinks}
        avatarPictureUrl={pictureUrl}
        initialCommunityTemplateRequest={communityTemplateRequest}
        isWebSearchAvailable={isWebSearchAvailableForFederalState(federalState.featureToggles)}
        isSpeechAvailable={federalState.featureToggles.isSpeechModelEnabled === true}
      />
    </DefaultPageLayout>
  );
}
