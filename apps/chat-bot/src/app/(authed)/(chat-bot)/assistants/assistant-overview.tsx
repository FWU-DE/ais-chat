'use client';

import type { WithFavorite } from '@shared/favorites/favorite-service';
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

import { getAssistantsByFilterAction } from '../actions/entity-filter-actions';
import CreateNewAssistantButton from './create-new-assistant-button';
import { AssistantWithImage } from './utils';

type AssistantOverviewProps = {
  currentUserId: string;
};

export default function AssistantOverview({ currentUserId }: AssistantOverviewProps) {
  const t = useTranslations('assistants');
  const tCommon = useTranslations();
  const [visibleAssistants, setVisibleAssistants] = useState<WithFavorite<AssistantWithImage>[]>(
    [],
  );
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const fetchAssistants = useCallback(async (filter: OverviewFilter) => {
    const entities = await getAssistantsByFilterAction(filter);
    setVisibleAssistants(entities);
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
    entityType: 'assistants',
    onLoad: fetchAssistants,
    translateFilterLabel: tCommon,
  });

  async function handleFilterChange(filter: OverviewFilter) {
    await setActiveFilter(filter);
  }

  const handleToggleFavorite = useOverviewFavoriteToggle({
    entityType: 'assistant',
    activeFilter,
    setEntities: setVisibleAssistants,
    entities: visibleAssistants,
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
      createButton={<CreateNewAssistantButton />}
      activeFilter={activeFilter}
      onFilterChange={handleFilterChange}
      itemCount={visibleAssistants.length}
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
        const filteredByAttributes = visibleAssistants.filter((assistant) =>
          matchesFilterValues(extractFilterValues(assistant), selectedFilters),
        );
        const filtered = filterAndSortEntities(filteredByAttributes, searchQuery, sortBy);

        return filtered.map((assistant) => (
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
            onToggleFavorite={(isFavorite) => handleToggleFavorite(assistant.id, isFavorite)}
          />
        ));
      }}
    </EntityOverview>
  );
}
