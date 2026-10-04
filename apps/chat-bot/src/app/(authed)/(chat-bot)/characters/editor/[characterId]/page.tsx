import { getCharacterForEditView } from '@shared/characters/character-service';
import { isWebSearchAvailableForFederalState } from '@/app/api/chat/websearch';
import { requireAuth } from '@/auth/requireAuth';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';
import { WebSource } from '@shared/db/types';
import { CharacterEdit } from './character-edit';
import { redirect } from 'next/navigation';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('characters.page-titles');
  return {
    title: t('edit'),
  };
}

export default async function Page(props: PageProps<'/characters/editor/[characterId]'>) {
  const { characterId } = await props.params;
  const { user, federalState } = await requireAuth();

  const {
    character,
    relatedFiles,
    maybeSignedPictureUrl,
    maxBudget,
    usedBudget,
    budgetUsedBySharedChat,
  } = await getCharacterForEditView({
    characterId,
    user,
    federalState,
  }).catch(handleErrorInServerComponent);

  const readOnly = user.id !== character.userId;

  if (readOnly) {
    redirect(`/characters/${characterId}`);
  }

  const initialLinks = character.attachedLinks
    .filter((l) => l !== '')
    .map(
      (url) =>
        ({
          link: url,
          error: false,
        }) as WebSource,
    );

  return (
    <DefaultPageLayout layoutConfig={{ layout: 'form' }}>
      <CharacterEdit
        character={character}
        relatedFiles={relatedFiles}
        initialLinks={initialLinks}
        avatarPictureUrl={maybeSignedPictureUrl}
        usedBudget={usedBudget ?? 0}
        maxBudget={maxBudget ?? 500}
        budgetUsedBySharedChat={budgetUsedBySharedChat}
        isWebSearchAvailable={isWebSearchAvailableForFederalState(federalState.featureToggles)}
        isSpeechAvailable={federalState.featureToggles.isSpeechModelEnabled === true}
      />
    </DefaultPageLayout>
  );
}
