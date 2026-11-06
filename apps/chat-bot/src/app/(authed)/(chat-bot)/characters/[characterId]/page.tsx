import { getCharacterForEditView } from '@shared/characters/character-service';
import { WebSource } from '@shared/db/types';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { isWebSearchAvailableForFederalState } from '@/app/api/chat/websearch';
import { requireAuth } from '@/auth/requireAuth';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';

import { CharacterView } from './character-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('characters.page-titles');
  return {
    title: t('view'),
  };
}

export default async function Page(props: PageProps<'/characters/[characterId]'>) {
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
    <DefaultPageLayout>
      <CharacterView
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
