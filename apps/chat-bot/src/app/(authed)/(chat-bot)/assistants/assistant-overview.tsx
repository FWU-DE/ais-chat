'use client';

import type { WithFavorite } from '@shared/favorites/favorite-service';
import { useTranslations } from 'next-intl';
import React from 'react';

import { RichText } from '@/components/common/rich-text';
import EntityCard from '@/components/entity-overview/entity-card';
import EntityOverview from '@/components/entity-overview/entity-overview';

import { getAssistantsByFilterAction } from '../actions/entity-filter-actions';
import CreateNewAssistantButton from './create-new-assistant-button';
import { AssistantWithImage } from './utils';

type AssistantOverviewProps = {
  currentUserId: string;
};

export default function AssistantOverview({ currentUserId }: AssistantOverviewProps) {
  const t = useTranslations('assistants');

  const infoContent = (
    <div className="whitespace-pre-line">
      <RichText>{(tags) => t.rich('info-dialog', tags)}</RichText>
    </div>
  );

  return (
    <EntityOverview<WithFavorite<AssistantWithImage>>
      entityType="assistant"
      title={t('title')}
      infoTooltip={infoContent}
      searchPlaceholder={t('search-placeholder')}
      createButton={<CreateNewAssistantButton />}
      fetchEntities={getAssistantsByFilterAction}
      renderItem={(assistant, onToggleFavorite) => (
        <EntityCard
          key={assistant.id}
          name={assistant.name}
          description={assistant.description}
          avatarUrl={assistant.maybeSignedPictureUrl}
          isOwned={assistant.userId === currentUserId}
          href={
            assistant.userId === currentUserId
              ? `/assistants/editor/${assistant.id}`
              : `/assistants/${assistant.id}`
          }
          chatHref={`/assistants/d/${assistant.id}`}
          isFavorite={assistant.isFavorite}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    />
  );
}
