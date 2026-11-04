import Chat from '@/components/chat/chat';
import Logo from '@/components/common/logo';
import { convertMessageModelToMessage } from '@/utils/chat/messages';
import { requireAuth } from '@/auth/requireAuth';
import {
  getConversation,
  getConversationMessages,
} from '@shared/conversation/conversation-service';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';
import { getAvatarPictureUrl } from '@shared/files/fileService';
import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { getDefaultModelNameByFederalStateId } from '@shared/llm-models/llm-model-service';
import { parseSearchParams } from '@/utils/parse-search-params';
import { z } from 'zod';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { getLearningScenarioForExistingConversation } from '@shared/learning-scenarios/learning-scenario-service';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NotFoundError } from '@shared/error';

export const dynamic = 'force-dynamic';
const searchParamsSchema = z.object({ model: z.string().optional() });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('learning-scenarios.page-titles');
  return {
    title: t('chat'),
  };
}

export default async function Page(
  props: PageProps<'/learning-scenarios/d/[learningScenarioId]/[conversationId]'>,
) {
  const params = await props.params;
  const searchParams = parseSearchParams(searchParamsSchema, await props.searchParams);
  const { user, federalState } = await requireAuth();
  const userAndContext = {
    ...user,
    federalState,
  };

  const [chat, rawChatMessages, learningScenario] = await Promise.all([
    getConversation({
      conversationId: params.conversationId,
      userId: user.id,
    }),
    getConversationMessages({
      conversationId: params.conversationId,
      userId: user.id,
    }),
    getLearningScenarioForExistingConversation({
      learningScenarioId: params.learningScenarioId,
      conversationId: params.conversationId,
      user,
    }),
  ]).catch(handleErrorInServerComponent);

  if (chat.learningScenarioId !== params.learningScenarioId) {
    handleErrorInServerComponent(new NotFoundError('Conversation not found'));
  }

  const chatMessages = convertMessageModelToMessage(rawChatMessages);

  const models = await dbGetLlmModelsByFederalStateId({
    federalStateId: federalState.id,
  });

  const lastUsedModelInChat = rawChatMessages.at(-1)?.modelName;
  const defaultModelName = await getDefaultModelNameByFederalStateId(federalState.id, models);

  const currentModel =
    searchParams.model ?? lastUsedModelInChat ?? user.lastUsedModel ?? defaultModelName;

  const avatarPictureUrl = await getAvatarPictureUrl(learningScenario.pictureId);
  const logoElement = <Logo logoPath={userAndContext.federalState.pictureUrls?.logo} />;

  return (
    <LlmModelsProvider
      models={models}
      initialModelName={currentModel}
      defaultModelName={defaultModelName}
      initialDownloadConversationEnabled={rawChatMessages.length > 0}
    >
      <DefaultPageLayout
        layoutConfig={{
          layout: 'chat',
          headerConfig: {
            chatId: chat.id,
            title: learningScenario.name,
            downloadConversationEnabled: rawChatMessages.length > 0,
            userAndContext,
          },
        }}
      >
        <Chat
          id={chat.id}
          initialMessages={chatMessages}
          learningScenario={learningScenario}
          enableFileUpload={true}
          imageSource={avatarPictureUrl}
          logoElement={logoElement}
        />
      </DefaultPageLayout>
    </LlmModelsProvider>
  );
}
