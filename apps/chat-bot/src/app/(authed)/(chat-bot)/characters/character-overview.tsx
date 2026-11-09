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

import { getCharactersByFilterAction } from '../actions/entity-filter-actions';
import { CreateNewCharacterButton } from './create-new-character-button';
import { CharacterWithImage } from './utils';

type CharacterOverviewProps = {
  currentUserId: string;
};

export default function CharacterOverview({ currentUserId }: CharacterOverviewProps) {
  const t = useTranslations('characters');
  const tCommon = useTranslations();
  const [visibleCharacters, setVisibleCharacters] = useState<WithFavorite<CharacterWithImage>[]>(
    [],
  );
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const fetchCharacters = useCallback(async (filter: OverviewFilter) => {
    const entities = await getCharactersByFilterAction(filter);
    setVisibleCharacters(entities);
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
    entityType: 'characters',
    onLoad: fetchCharacters,
    translateFilterLabel: tCommon,
  });

  async function handleFilterChange(filter: OverviewFilter) {
    await setActiveFilter(filter);
  }

  const handleToggleFavorite = useOverviewFavoriteToggle({
    entityType: 'character',
    activeFilter,
    setEntities: setVisibleCharacters,
    entities: visibleCharacters,
  });

  const infoContent = (
    <div className="whitespace-pre-line">
      <RichText>{(tags) => t.rich('info-dialog', tags)}</RichText>
    </div>
  );

  return (
    <EntityOverview
      entityType="characters"
      title={t('character')}
      infoTooltip={infoContent}
      searchPlaceholder={t('search-placeholder')}
      createButton={<CreateNewCharacterButton />}
      activeFilter={activeFilter}
      onFilterChange={handleFilterChange}
      itemCount={visibleCharacters.length}
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
        const filteredByAttributes = visibleCharacters.filter((character) =>
          matchesFilterValues(extractFilterValues(character), selectedFilters),
        );
        const filtered = filterAndSortEntities(filteredByAttributes, searchQuery, sortBy);

        return filtered.map((character) => {
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
              shareInfo={character}
              isFavorite={character.isFavorite}
              onToggleFavorite={(isFavorite) => handleToggleFavorite(character.id, isFavorite)}
            />
          );
        });
      }}
    </EntityOverview>
  );
}
