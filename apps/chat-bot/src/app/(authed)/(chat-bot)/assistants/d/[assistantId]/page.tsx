import { generateUUID } from '@shared/utils/uuid';
import Chat from '@/components/chat/chat';
import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { getDefaultModelNameByFederalStateId } from '@shared/llm-models/llm-model-service';
import Logo from '@/components/common/logo';
import { getAssistantForNewChat } from '@shared/assistants/assistant-service';
import { requireAuth } from '@/auth/requireAuth';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';
import { getAvatarPictureUrl } from '@shared/files/fileService';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('assistants.page-titles');
  return {
    title: t('chat'),
  };
}

export default async function Page(props: PageProps<'/assistants/d/[assistantId]'>) {
  const { assistantId } = await props.params;
  const id = generateUUID();
  const { user, federalState } = await requireAuth();
  const userAndContext = {
    ...user,
    federalState,
  };

  const assistant = await getAssistantForNewChat({
    assistantId: assistantId,
    user: user,
  }).catch(handleErrorInServerComponent);

  const logoElement = <Logo logoPath={federalState.pictureUrls?.logo} />;
  const models = await dbGetLlmModelsByFederalStateId({
    federalStateId: federalState.id,
  });

  const defaultModelName = await getDefaultModelNameByFederalStateId(federalState.id, models);
  const currentModel = user.lastUsedModel ?? defaultModelName;
  const avatarPictureUrl = await getAvatarPictureUrl(assistant.pictureId);

  return (
    <LlmModelsProvider
      models={models}
      initialModelName={currentModel}
      defaultModelName={defaultModelName}
    >
      <DefaultPageLayout
        layoutConfig={{
          layout: 'chat',
          headerConfig: {
            chatId: id,
            userAndContext,
            downloadConversationEnabled: false,
          },
        }}
      >
        <Chat
          id={id}
          initialMessages={[]}
          assistant={assistant}
          enableFileUpload={true}
          promptSuggestions={assistant.promptSuggestions}
          imageSource={avatarPictureUrl}
          logoElement={logoElement}
        />
      </DefaultPageLayout>
    </LlmModelsProvider>
  );
}
