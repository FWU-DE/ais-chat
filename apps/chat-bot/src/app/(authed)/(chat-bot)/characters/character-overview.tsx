'use client';

import type { WithFavorite } from '@shared/favorites/favorite-service';
import { useTranslations } from 'next-intl';
import React from 'react';

import { RichText } from '@/components/common/rich-text';
import EntityCard from '@/components/entity-overview/entity-card';
import EntityOverview from '@/components/entity-overview/entity-overview';

import { getCharactersByFilterAction } from '../actions/entity-filter-actions';
import { CreateNewCharacterButton } from './create-new-character-button';
import { CharacterWithImage } from './utils';

type CharacterOverviewProps = {
  currentUserId: string;
};

export default function CharacterOverview({ currentUserId }: CharacterOverviewProps) {
  const t = useTranslations('characters');

  const infoContent = (
    <div className="whitespace-pre-line">
      <RichText>{(tags) => t.rich('info-dialog', tags)}</RichText>
    </div>
  );

  return (
    <EntityOverview<WithFavorite<CharacterWithImage>>
      entityType="character"
      title={t('character')}
      infoTooltip={infoContent}
      searchPlaceholder={t('search-placeholder')}
      createButton={<CreateNewCharacterButton />}
      fetchEntities={getCharactersByFilterAction}
      renderItem={(character, onToggleFavorite) => {
        const isOwned = character.userId === currentUserId;
        return (
          <EntityCard
            key={character.id}
            name={character.name}
            description={character.description}
            avatarUrl={character.maybeSignedPictureUrl}
            isOwned={isOwned}
            href={isOwned ? `/characters/editor/${character.id}` : `/characters/${character.id}`}
            chatHref={`/characters/d/${character.id}`}
            isFavorite={character.isFavorite}
            onToggleFavorite={onToggleFavorite}
            shareInfo={character}
          />
        );
      }}
    />
  );
}
