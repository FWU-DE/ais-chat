'use client';

import type { WithFavorite } from '@shared/favorites/favorite-service';
import { LearningScenarioWithImage } from '@shared/learning-scenarios/learning-scenario-service';
import { OverviewFilter } from '@shared/overview-filter';
import { useTranslations } from 'next-intl';
import React, { useCallback, useState } from 'react';

import { RichText } from '@/components/common/rich-text';
import FilterSelectSection from '@/components/custom-chat/filter/custom-chat-filter-select-section';
import {
  extractFilterValues,
  matchesFilterValues,
} from '@/components/custom-chat/filter/custom-chat-filter-utils';
import EntityCard from '@/components/entity-overview/entity-card';
import EntityOverview from '@/components/entity-overview/entity-overview';
import { filterAndSortEntities } from '@/components/entity-overview/utils';
import { useOverviewFavoriteToggle } from '@/components/hooks/use-overview-favorite-toggle';
import { useOverviewFilters } from '@/components/hooks/use-overview-filters';

import { getLearningScenariosByFilterAction } from '../actions/entity-filter-actions';
import { CreateNewLearningScenarioButton } from './create-new-learning-scenario-button';

type LearningScenarioOverviewProps = {
  currentUserId: string;
};

export default function LearningScenarioOverview({ currentUserId }: LearningScenarioOverviewProps) {
  const t = useTranslations('learning-scenarios');
  const tCommon = useTranslations();
  const [visibleLearningScenarios, setVisibleLearningScenarios] = useState<
    WithFavorite<LearningScenarioWithImage>[]
  >([]);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const fetchLearningScenarios = useCallback(async (filter: OverviewFilter) => {
    const entities = await getLearningScenariosByFilterAction(filter);
    setVisibleLearningScenarios(entities);
  }, []);

  const {
    activeFilter,
    setActiveFilter,
    selectedFilters,
    updateSelectedFilters,
    handleRemoveFilter,
    resetSelectedFilters,
    activeFilterPills,
    activeFilterCount,
  } = useOverviewFilters({
    entityType: 'learning-scenarios',
    onLoad: fetchLearningScenarios,
    translateFilterLabel: tCommon,
  });

  async function handleFilterChange(filter: OverviewFilter) {
    await setActiveFilter(filter);
  }

  const handleToggleFavorite = useOverviewFavoriteToggle({
    entityType: 'learningScenario',
    activeFilter,
    setEntities: setVisibleLearningScenarios,
    entities: visibleLearningScenarios,
  });

  const infoContent = (
    <div className="whitespace-pre-line">
      <RichText>{(tags) => t.rich('info-dialog', tags)}</RichText>
    </div>
  );

  return (
    <EntityOverview
      title={t('title')}
      infoTooltip={infoContent}
      searchPlaceholder={t('search-placeholder')}
      createButton={<CreateNewLearningScenarioButton />}
      activeFilter={activeFilter}
      onFilterChange={handleFilterChange}
      itemCount={visibleLearningScenarios.length}
      isFilterPanelOpen={isFilterPanelOpen}
      onFilterPanelToggle={() => setIsFilterPanelOpen((previous) => !previous)}
      filterActiveCount={activeFilterCount}
      activeFilterPills={activeFilterPills}
      onRemoveFilter={handleRemoveFilter}
      filterPanel={
        <FilterSelectSection
          className="mt-0"
          isEditView={false}
          onReset={resetSelectedFilters}
          hasActiveValues={activeFilterCount > 0}
          values={selectedFilters}
          onSchoolTypesChange={(values) => updateSelectedFilters('schoolTypes', values)}
          onGradeRangesChange={(values) => updateSelectedFilters('gradeRanges', values)}
          onSubjectsChange={(values) => updateSelectedFilters('subjects', values)}
          onCategoriesChange={(values) => updateSelectedFilters('categories', values)}
          onFederalStatesChange={(values) => updateSelectedFilters('federalStates', values)}
          onLanguagesChange={(values) => updateSelectedFilters('languages', values)}
        />
      }
    >
      {(searchQuery, sortBy) => {
        const filteredByAttributes = visibleLearningScenarios.filter((scenario) =>
          matchesFilterValues(extractFilterValues(scenario), selectedFilters),
        );
        const filtered = filterAndSortEntities(filteredByAttributes, searchQuery, sortBy);

        return filtered.map((scenario) => {
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
              shareInfo={scenario}
              isFavorite={scenario.isFavorite}
              onToggleFavorite={(isFavorite) => handleToggleFavorite(scenario.id, isFavorite)}
            />
          );
        });
      }}
    </EntityOverview>
  );
}
