import { resolveSpeechAvailability } from '@shared/speech/speech-availability';
import Chat from '@/components/chat/chat';
import { dbGetConversationAndMessages } from '@shared/db/functions/chat';
import { convertMessageModelToMessage } from '@/utils/chat/messages';
import { redirect } from 'next/navigation';
import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { getDefaultModelNameByFederalStateId } from '@shared/llm-models/llm-model-service';
import { dbGetRelatedFiles } from '@shared/db/functions/files';
import Logo from '@/components/common/logo';
import z from 'zod';
import { parseSearchParams } from '@/utils/parse-search-params';
import { requireAuth } from '@/auth/requireAuth';
import { WebSource } from '@shared/db/types';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { utils } from '@shared/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.page-titles');
  return {
    title: t('chat'),
  };
}

const searchParamsSchema = z.object({ model: z.string().optional() });

export default async function Page(props: PageProps<'/d/[conversationId]'>) {
  const { conversationId } = await props.params;
  const searchParams = parseSearchParams(searchParamsSchema, await props.searchParams);

  const { user, federalState } = await requireAuth();
  const { isSpeechAvailable } = await resolveSpeechAvailability(federalState.featureToggles);
  const userAndContext = {
    ...user,
    federalState,
  };

  const conversationObject = await dbGetConversationAndMessages({
    conversationId,
    userId: user.id,
  });

  if (conversationObject === undefined) {
    redirect('/');
  }
  const fileMapping = await dbGetRelatedFiles(conversationId);
  const { conversation, messages } = conversationObject;

  const models = await dbGetLlmModelsByFederalStateId({
    federalStateId: userAndContext.federalState.id,
  });

  const lastUsedModelInChat = messages.at(-1)?.modelName;
  const defaultModelName = await getDefaultModelNameByFederalStateId(
    userAndContext.federalState.id,
    models,
  );

  const currentModel =
    searchParams.model ?? lastUsedModelInChat ?? user.lastUsedModel ?? defaultModelName;

  const convertedMessages = convertMessageModelToMessage(messages);
  const webSourceMapping = new Map<string, WebSource[]>();
  const logoElement = <Logo logoPath={userAndContext.federalState.pictureUrls?.logo} />;

  // prepare urls for citations
  for (const message of messages.filter((msg) => msg.role === 'user')) {
    const urls = utils.url.parseHyperlinks(message.content);
    if (urls && urls.length > 0) {
      const webSources: WebSource[] = urls.map((url) => ({
        link: url,
      }));
      webSourceMapping.set(message.id, webSources);
    }
  }

  return (
    <LlmModelsProvider
      models={models}
      initialModelName={currentModel}
      defaultModelName={defaultModelName}
      initialDownloadConversationEnabled={convertedMessages.length > 0}
    >
      <DefaultPageLayout
        layoutConfig={{
          layout: 'chat',
          headerConfig: {
            chatId: conversation.id,
            downloadConversationEnabled: convertedMessages.length > 0,
            userAndContext,
          },
        }}
      >
        <Chat
          id={conversation.id}
          initialMessages={convertedMessages}
          initialFileMapping={fileMapping}
          enableFileUpload={true}
          webSourceMapping={webSourceMapping}
          isSpeechAvailable={isSpeechAvailable}
          logoElement={logoElement}
        />
      </DefaultPageLayout>
    </LlmModelsProvider>
  );
}
