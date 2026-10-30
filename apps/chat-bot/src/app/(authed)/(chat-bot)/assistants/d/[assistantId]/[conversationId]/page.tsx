import { requireAuth } from '@/auth/requireAuth';
import Chat from '@/components/chat/chat';
import Logo from '@/components/common/logo';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';
import { convertMessageModelToMessage } from '@/utils/chat/messages';
import { parseSearchParams } from '@/utils/parse-search-params';
import { getConversationWithMessagesAndAssistant } from '@shared/assistants/assistant-service';
import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { getAvatarPictureUrl } from '@shared/files/fileService';
import { getDefaultModelNameByFederalStateId } from '@shared/llm-models/llm-model-service';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import z from 'zod';

export const dynamic = 'force-dynamic';

const searchParamsSchema = z.object({ model: z.string().optional() });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('assistants.page-titles');
  return {
    title: t('chat'),
  };
}

export default async function Page(
  props: PageProps<'/assistants/d/[assistantId]/[conversationId]'>,
) {
  const { assistantId, conversationId } = await props.params;
  const searchParams = parseSearchParams(searchParamsSchema, await props.searchParams);
  const { user, federalState } = await requireAuth();
  const userAndContext = {
    ...user,
    federalState,
  };

  const { conversation, messages, assistant } = await getConversationWithMessagesAndAssistant({
    conversationId: conversationId,
    assistantId: assistantId,
    userId: user.id,
  }).catch(handleErrorInServerComponent);

  const chatMessages = convertMessageModelToMessage(messages);

  const models = await dbGetLlmModelsByFederalStateId({
    federalStateId: federalState.id,
  });

  const logoElement = <Logo logoPath={federalState.pictureUrls?.logo} />;

  const lastUsedModelInChat = messages.at(-1)?.modelName;
  const defaultModelName = await getDefaultModelNameByFederalStateId(federalState.id, models);

  const currentModel =
    searchParams.model ?? lastUsedModelInChat ?? user.lastUsedModel ?? defaultModelName;

  const avatarPictureUrl = await getAvatarPictureUrl(assistant.pictureId);

  return (
    <LlmModelsProvider
      models={models}
      initialModelName={currentModel}
      defaultModelName={defaultModelName}
      initialDownloadConversationEnabled={chatMessages.length > 0}
    >
      <DefaultPageLayout
        layoutConfig={{
          layout: 'chat',
          headerConfig: {
            chatId: conversation.id,
            title: assistant.name,
            downloadConversationEnabled: chatMessages.length > 0,
            userAndContext,
          },
        }}
      >
        <Chat
          id={conversation.id}
          initialMessages={chatMessages}
          assistant={assistant}
          enableFileUpload={true}
          imageSource={avatarPictureUrl}
          logoElement={logoElement}
        />
      </DefaultPageLayout>
    </LlmModelsProvider>
  );
}
