'use client';

import type { WithFavorite } from '@shared/favorites/favorite-service';
import { LearningScenarioWithImage } from '@shared/learning-scenarios/learning-scenario-service';
import { useTranslations } from 'next-intl';
import React from 'react';

import { RichText } from '@/components/common/rich-text';
import EntityCard from '@/components/entity-overview/entity-card';
import EntityOverview from '@/components/entity-overview/entity-overview';

import { getLearningScenariosByFilterAction } from '../actions/entity-filter-actions';
import { CreateNewLearningScenarioButton } from './create-new-learning-scenario-button';

type LearningScenarioOverviewProps = {
  currentUserId: string;
};

export default function LearningScenarioOverview({ currentUserId }: LearningScenarioOverviewProps) {
  const t = useTranslations('learning-scenarios');

  const infoContent = (
    <div className="whitespace-pre-line">
      <RichText>{(tags) => t.rich('info-dialog', tags)}</RichText>
    </div>
  );

  return (
    <EntityOverview<WithFavorite<LearningScenarioWithImage>>
      entityType="learningScenario"
      title={t('title')}
      infoTooltip={infoContent}
      searchPlaceholder={t('search-placeholder')}
      createButton={<CreateNewLearningScenarioButton />}
      fetchEntities={getLearningScenariosByFilterAction}
      renderItem={(scenario, onToggleFavorite) => {
        const isOwned = scenario.userId === currentUserId;
        return (
          <EntityCard
            key={scenario.id}
            name={scenario.name}
            description={scenario.description}
            avatarUrl={scenario.maybeSignedPictureUrl}
            isOwned={isOwned}
            href={
              isOwned
                ? `/learning-scenarios/editor/${scenario.id}`
                : `/learning-scenarios/${scenario.id}`
            }
            chatHref={`/learning-scenarios/d/${scenario.id}`}
            isFavorite={scenario.isFavorite}
            onToggleFavorite={onToggleFavorite}
            shareInfo={scenario}
          />
        );
      }}
    />
  );
}
