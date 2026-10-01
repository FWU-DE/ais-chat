import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { dbGetLlmModelById } from '@shared/db/functions/llm-model';
import { dbGetCharacterByIdAndInviteCode } from '@shared/db/functions/character';
import CharacterSharedChat from '@/components/shared-chat/character-shared-chat';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { dbGetFederalStateByUserId } from '@shared/db/functions/school';
import { DEFAULT_DESIGN_CONFIGURATION } from '@/db/const';
import { notFound } from 'next/navigation';
import z from 'zod';
import { parseSearchParams } from '@/utils/parse-search-params';
import { getAvatarPictureUrl } from '@shared/files/fileService';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { resolveSharingLocale } from '@/i18n/sharing-locale';
import { loadTranslations } from '@/i18n/load-translations';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('characters.page-titles');
  return {
    title: t('chat-shared'),
  };
}

const searchParamsSchema = z.object({ inviteCode: z.string() });

export default async function Page(props: PageProps<'/ua/characters/[characterId]/dialog'>) {
  const { characterId } = await props.params;
  const searchParams = parseSearchParams(searchParamsSchema, await props.searchParams);

  const character = await dbGetCharacterByIdAndInviteCode({
    id: characterId,
    inviteCode: searchParams.inviteCode,
  });

  if (!character) {
    notFound();
  }
  const model = await dbGetLlmModelById({ modelId: character.modelId });
  const avatarPictureUrl = await getAvatarPictureUrl(character.pictureId);

  if (model === undefined) {
    notFound();
  }
  const federalState = await dbGetFederalStateByUserId({ userId: character.startedBy });
  const designConfiguration = federalState?.designConfiguration ?? DEFAULT_DESIGN_CONFIGURATION;
  const locale = await resolveSharingLocale({
    customChatVariant: 'character',
    customChatId: character.id,
    sharingUserId: character.startedBy,
  });
  const messages = await loadTranslations(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LlmModelsProvider
        models={[model]}
        initialModelName={model.name}
        defaultModelName={model.name}
      >
        <ThemeProvider designConfiguration={designConfiguration}>
          <CharacterSharedChat
            {...character}
            initialMessage={character.initialMessage ?? ''}
            inviteCode={searchParams.inviteCode}
            avatarPictureUrl={avatarPictureUrl}
            isSpeechModelEnabled={federalState?.featureToggles?.isSpeechModelEnabled === true}
          />
        </ThemeProvider>
      </LlmModelsProvider>
    </NextIntlClientProvider>
  );
}
