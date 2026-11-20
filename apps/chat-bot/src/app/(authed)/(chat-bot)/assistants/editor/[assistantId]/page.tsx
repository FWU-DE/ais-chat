import { getAssistantByUser } from '@shared/assistants/assistant-service';
import { getCommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';
import { getSpeechModelVoices } from '@shared/llm-models/llm-model-service';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { isWebSearchAvailableForFederalState } from '@/app/api/chat/websearch';
import { requireAuth } from '@/auth/requireAuth';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';

import { AssistantEdit } from './assistant-edit';

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

  const {
    assistant,
    fileMappings,
    pictureUrl,
    isFavorite: initialIsFavorite,
  } = await getAssistantByUser({ assistantId, user }).catch(handleErrorInServerComponent);

  const communityTemplateRequest = await getCommunityTemplateRequestWithEvents({
    entityRef: { entityType: 'assistant', entityId: assistantId },
    user,
  }).catch(handleErrorInServerComponent);

  const initialLinks = assistant.attachedLinks
    .filter((l) => l !== '')
    .map((url) => ({ link: url }));

  const isSpeechAvailable = federalState.featureToggles.isSpeechModelEnabled === true;
  const speechVoices = isSpeechAvailable ? await getSpeechModelVoices() : [];

  return (
    <DefaultPageLayout layoutConfig={{ layout: 'form' }}>
      <AssistantEdit
        assistant={assistant}
        relatedFiles={fileMappings}
        initialLinks={initialLinks}
        avatarPictureUrl={pictureUrl}
        initialIsFavorite={initialIsFavorite}
        initialCommunityTemplateRequest={communityTemplateRequest}
        isWebSearchAvailable={isWebSearchAvailableForFederalState(federalState.featureToggles)}
        isSpeechAvailable={isSpeechAvailable}
        speechVoices={speechVoices}
      />
    </DefaultPageLayout>
  );
}
