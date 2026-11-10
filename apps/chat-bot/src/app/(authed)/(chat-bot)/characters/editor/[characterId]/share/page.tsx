import { getSharedCharacter } from '@shared/characters/character-service';
import { calculateShareSessionState } from '@shared/sharing/calculate-share-session-state';
import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { requireAuth } from '@/auth/requireAuth';
import CustomChatSharePage from '@/components/custom-chat/custom-chat-share-page';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('characters.page-titles');
  return {
    title: t('share'),
  };
}

export default async function Page(props: PageProps<'/characters/editor/[characterId]/share'>) {
  const params = await props.params;
  const { user } = await requireAuth();

  const character = await getSharedCharacter({
    userId: user.id,
    characterId: params.characterId,
  }).catch(handleErrorInServerComponent);

  if (!character.inviteCode) notFound();

  const inviteCode = character.inviteCode;
  const shareUrl = `/ua/characters/${character.id}/dialog?inviteCode=${inviteCode}`;
  const leftTime = calculateShareSessionState(character).timeLeftInSeconds;

  return (
    <CustomChatSharePage
      backHref={`/characters/editor/${character.id}`}
      customChatName={character.name}
      inviteCode={inviteCode}
      leftTimeInSeconds={leftTime}
      relativeShareUrl={shareUrl}
      totalTimeInSeconds={character.maxUsageTimeLimit * 60}
      customChatVariant="character"
      expiredAt={character.expiredAt}
      manuallyStoppedAt={character.manuallyStoppedAt}
      customChatId={character.id}
      sharingUserId={character.startedBy}
    />
  );
}
