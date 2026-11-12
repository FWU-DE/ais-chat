'use client';

import { Button } from '@ais-chat/ui/components/button';
import { FilterTabs } from '@ais-chat/ui/components/filter-tabs';
import { Input } from '@ais-chat/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ais-chat/ui/components/select';
import { CaretDownIcon, InfoIcon, MagnifyingGlassIcon, XCircleIcon } from '@phosphor-icons/react';
import type { EntityType } from '@shared/entities/entity-types';
import { OverviewFilter, overviewFilterSchema } from '@shared/overview-filter';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Chip } from '@ui/components/chip';
import { useTranslations } from 'next-intl';
import React from 'react';

import { InfoDialog } from '@/components/common/dialog';
import FilterSelectSection from '@/components/custom-chat/filter/custom-chat-filter-select-section';
import {
  type EntityWithFilterValues,
  extractFilterValues,
  matchesFilterValues,
} from '@/components/custom-chat/filter/custom-chat-filter-utils';
import { useOverviewFavoriteToggle } from '@/components/hooks/use-overview-favorite-toggle';
import { useOverviewFilters } from '@/components/hooks/use-overview-filters';
import { useFederalState } from '@/components/providers/federal-state-provider';
import { useSessionStorageState } from '@/hooks/use-session-storage-state';

import { filterAndSortEntities, isSortOption, SortableEntity, SortOption } from './utils';

type OverviewEntity = SortableEntity & EntityWithFilterValues & { id: string; isFavorite: boolean };

type EntityOverviewProps<T extends OverviewEntity> = {
  entityType: EntityType;
  title: string;
  infoTooltip: React.ReactNode;
  searchPlaceholder: string;
  createButton: React.ReactNode;
  fetchEntities: (filter: OverviewFilter) => Promise<T[]>;
  renderItem: (
    entity: T,
    onToggleFavorite: (isFavorite: boolean) => Promise<void>,
  ) => React.ReactNode;
};

const FILTER_OPTIONS = overviewFilterSchema.options;
const OVERVIEW_CONTROL_TRIGGER_CLASSNAME =
  'w-fit gap-1 border-0 bg-transparent shadow-none text-sm hover:bg-transparent';

const DEFAULT_SORT_OPTION: SortOption = 'date-desc';

function parseSortOption(raw: string | null): SortOption {
  return raw !== null && isSortOption(raw) ? raw : DEFAULT_SORT_OPTION;
}

export default function EntityOverview<T extends OverviewEntity>({
  entityType,
  title,
  infoTooltip,
  searchPlaceholder,
  createButton,
  fetchEntities,
  renderItem,
}: EntityOverviewProps<T>) {
  const [isFilterPanelOpen, setIsFilterPanelOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState('');
  const tCommon = useTranslations();
  const {
    activeFilter,
    setActiveFilter,
    isActiveFilterResolved,
    selectedFilters,
    updateSelectedFilters,
    handleRemoveFilter,
    resetSelectedFilters,
    activeFilterPills,
    activeFilterCount,
  } = useOverviewFilters({
    entityType,
    translateFilterLabel: tCommon,
  });
  const queryKey = React.useMemo(
    () => ['entity-overview', entityType, activeFilter],
    [entityType, activeFilter],
  );
  const { data: entities = [] } = useQuery({
    queryKey,
    queryFn: () => fetchEntities(activeFilter),
    enabled: isActiveFilterResolved,
    placeholderData: keepPreviousData,
  });
  const queryClient = useQueryClient();
  const setEntities = React.useCallback(
    (update: (previous: T[]) => T[]) =>
      queryClient.setQueryData<T[]>(queryKey, (previous) => previous && update(previous)),
    [queryClient, queryKey],
  );
  const handleToggleFavorite = useOverviewFavoriteToggle({
    entityType,
    activeFilter,
    entities,
    setEntities,
  });
  const [sortBy, setSortBy] = useSessionStorageState(
    `overview-sort-${entityType}`,
    parseSortOption,
    DEFAULT_SORT_OPTION,
  );
  const federalState = useFederalState();
  const t = useTranslations('entity-overview');
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const filterPanelId = React.useId();

  const handleClearSearch = () => {
    setSearchInput('');
    inputRef.current?.focus();
  };

  const showSchoolFilter = federalState?.featureToggles?.isShareTemplateWithSchoolEnabled ?? false;
  const filterDisabled = entities.length < 1;

  const visibleTabs = FILTER_OPTIONS.filter((f) => f !== 'school' || showSchoolFilter).map((f) => ({
    value: f,
    label: t(`filter-${f}`),
  }));

  React.useEffect(() => {
    scrollContainerRef.current?.closest('main')?.scrollTo({ top: 0 });
  }, [activeFilter]);

  const visibleEntities = filterAndSortEntities(
    entities.filter((entity) => matchesFilterValues(extractFilterValues(entity), selectedFilters)),
    searchInput,
    sortBy,
  );

  return (
    <div className="min-w-full flex flex-col">
      <div ref={scrollContainerRef}>
        <div className="pt-6">
          <div className="flex items-end gap-2 mb-6">
            <h1 className="text-3xl">{title}</h1>
            <InfoDialog
              title={title}
              content={infoTooltip}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-round"
                  className="text-primary"
                  aria-label={t('info-tooltip-label')}
                >
                  <InfoIcon className="size-8" aria-hidden="true" />
                </Button>
              }
            />
          </div>

          <div className="flex flex-wrap-reverse justify-between gap-2 mb-4">
            <div className="relative max-w-sm w-full">
              <Input
                ref={inputRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={searchPlaceholder}
                disabled={filterDisabled}
                aria-label={searchPlaceholder}
                className="h-10 rounded-xl border-gray-300 bg-card pr-10 pl-4 shadow-none focus-visible:border-gray-400 focus-visible:ring-0"
              />
              {searchInput ? (
                <XCircleIcon
                  className="absolute right-3 top-3/5 size-5 -translate-y-2/3 text-gray-500 hover:text-gray-700 cursor-pointer transition-colors"
                  aria-hidden="true"
                  onClick={handleClearSearch}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleClearSearch();
                    }
                  }}
                />
              ) : (
                <MagnifyingGlassIcon
                  className="pointer-events-none absolute right-3 top-3/5 size-5 -translate-y-2/3 text-gray-500"
                  aria-hidden="true"
                />
              )}
            </div>
            {createButton}
          </div>
        </div>

        <div className="py-2 pb-4 sticky top-0 z-10 bg-background-2">
          <div
            className="flex items-end flex-wrap gap-y-2 gap-x-4"
            aria-label={t('filter-tabs-label')}
          >
            <FilterTabs tabs={visibleTabs} activeTab={activeFilter} onTabChange={setActiveFilter} />
            <div className="grow" />
            <div className="flex gap-2 whitespace-nowrap">
              <div className="text-primary hover:text-primary-dark">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFilterPanelOpen((previous) => !previous)}
                  className={`${OVERVIEW_CONTROL_TRIGGER_CLASSNAME} relative aria-expanded:bg-transparent aria-expanded:text-primary`}
                  aria-label={t('filter-label')}
                  aria-expanded={isFilterPanelOpen}
                  aria-controls={filterPanelId}
                >
                  <span className="font-normal text-primary">{t('filter-label')}</span>
                  <CaretDownIcon
                    className="size-4 transition-transform"
                    aria-hidden="true"
                    weight="bold"
                  />
                  {activeFilterCount > 0 ? (
                    <span className="absolute -top-1 -right-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] leading-none text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </Button>
              </div>
              <div className="text-primary hover:text-primary-dark">
                <Select
                  value={sortBy}
                  onValueChange={(v) => {
                    if (isSortOption(v)) {
                      setSortBy(v);
                    }
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className={OVERVIEW_CONTROL_TRIGGER_CLASSNAME}
                    aria-label={t('sort-label')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end" position="popper">
                    <SelectItem value="date-desc">{t('sort-date-desc')}</SelectItem>
                    <SelectItem value="date-asc">{t('sort-date-asc')}</SelectItem>
                    <SelectItem value="name-asc">{t('sort-name-asc')}</SelectItem>
                    <SelectItem value="name-desc">{t('sort-name-desc')}</SelectItem>
                    <SelectItem value="popularity">{t('sort-popularity')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {isFilterPanelOpen ? (
            <div
              id={filterPanelId}
              className="mt-3 rounded-xl border border-gray-200 bg-background p-3 sm:p-4"
            >
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
            </div>
          ) : null}

          {activeFilterPills.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-foreground">
                {t('hits-for', { count: visibleEntities.length })}
              </span>
              {activeFilterPills.map((pill) => (
                <Chip
                  key={`${pill.group}-${pill.value}`}
                  size="sm"
                  label={pill.label}
                  onDelete={() => handleRemoveFilter(pill.group, pill.value)}
                  ariaDeleteLabel={t('filter-aria-delete', { filter_name: pill.label })}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="pb-6">
          <div className="flex flex-col gap-2 w-full py-1">
            {visibleEntities.map((entity) =>
              renderItem(entity, (isFavorite) => handleToggleFavorite(entity.id, isFavorite)),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
