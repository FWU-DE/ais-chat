import { getCharacterForChatSession } from '@shared/characters/character-service';
import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { getAvatarPictureUrl } from '@shared/files/fileService';
import { getDefaultModelNameByFederalStateId } from '@shared/llm-models/llm-model-service';
import { generateUUID } from '@shared/utils/uuid';
import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { requireAuth } from '@/auth/requireAuth';
import Chat from '@/components/chat/chat';
import Logo from '@/components/common/logo';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { type ChatMessage as Message } from '@/types/chat';
import { parseSearchParams } from '@/utils/parse-search-params';

export const dynamic = 'force-dynamic';
const searchParamsSchema = z.object({ model: z.string().optional() });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('characters.page-titles');
  return {
    title: t('chat'),
  };
}

export default async function Page(props: PageProps<'/characters/d/[characterId]'>) {
  const { characterId } = await props.params;
  const searchParams = parseSearchParams(searchParamsSchema, await props.searchParams);

  const id = generateUUID();
  const { user, federalState } = await requireAuth();
  const userAndContext = {
    ...user,
    federalState,
  };

  const character = await getCharacterForChatSession({
    characterId,
    user,
  }).catch(() => {
    notFound();
  });

  const initialMessages: Message[] = character.initialMessage
    ? [{ id: 'initial-message', role: 'assistant', content: character.initialMessage }]
    : [];

  const models = await dbGetLlmModelsByFederalStateId({
    federalStateId: federalState.id,
  });
  const characterModel = models.find((m) => m.id === character.modelId)?.name;
  const defaultModelName = await getDefaultModelNameByFederalStateId(federalState.id, models);

  const currentModel =
    searchParams.model ?? characterModel ?? user.lastUsedModel ?? defaultModelName;

  const avatarPictureUrl = await getAvatarPictureUrl(character.pictureId);
  const logoElement = <Logo logoPath={userAndContext.federalState.pictureUrls?.logo} />;
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
            title: character.name,
            downloadConversationEnabled: false,
            userAndContext,
          },
        }}
      >
        <Chat
          id={id}
          initialMessages={initialMessages}
          character={character}
          imageSource={avatarPictureUrl}
          enableFileUpload={true}
          logoElement={logoElement}
        />
      </DefaultPageLayout>
    </LlmModelsProvider>
  );
}
