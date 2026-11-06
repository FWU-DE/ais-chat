'use client';

import type { OverviewFilter } from '@shared/overview-filter';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import {
  type ActiveFilterPill,
  EMPTY_FILTER_VALUES,
  type FilterValues,
  getActiveFilterPills,
} from '@/components/custom-chat/filter/custom-chat-filter-utils';
import {
  type EntityType,
  usePersistedOverviewFilter,
} from '@/components/hooks/use-persisted-overview-filter';

type UseOverviewFiltersOptions = {
  entityType: EntityType;
  onLoad: (filter: OverviewFilter) => Promise<void>;
  translateFilterLabel: ReturnType<typeof useTranslations<never>>;
};

type UseOverviewFiltersResult = {
  activeFilter: OverviewFilter;
  setActiveFilter: (filter: OverviewFilter) => Promise<void>;
  isLoading: boolean;
  selectedFilters: FilterValues;
  updateSelectedFilters: <K extends keyof FilterValues>(key: K, values: FilterValues[K]) => void;
  handleRemoveFilter: (group: string, value: string) => void;
  resetSelectedFilters: () => void;
  activeFilterPills: ActiveFilterPill[];
  activeFilterCount: number;
};

export function useOverviewFilters({
  entityType,
  onLoad,
  translateFilterLabel,
}: UseOverviewFiltersOptions): UseOverviewFiltersResult {
  const [activeFilter, setActiveFilter, isLoading] = usePersistedOverviewFilter(entityType, onLoad);
  const [selectedFilters, setSelectedFilters] = useState<FilterValues>(EMPTY_FILTER_VALUES);

  const updateSelectedFilters = useCallback(
    <K extends keyof FilterValues>(key: K, values: FilterValues[K]) => {
      setSelectedFilters((previous) => ({
        ...previous,
        [key]: values,
      }));
    },
    [],
  );

  const handleRemoveFilter = useCallback((group: string, value: string) => {
    const key = group as keyof FilterValues;
    setSelectedFilters((previous) => ({
      ...previous,
      [key]: (previous[key] as string[]).filter((item) => item !== value),
    }));
  }, []);

  const resetSelectedFilters = useCallback(() => {
    setSelectedFilters(EMPTY_FILTER_VALUES);
  }, []);

  const activeFilterPills = useMemo(
    () => getActiveFilterPills(selectedFilters, translateFilterLabel),
    [selectedFilters, translateFilterLabel],
  );

  return {
    activeFilter,
    setActiveFilter,
    isLoading,
    selectedFilters,
    updateSelectedFilters,
    handleRemoveFilter,
    resetSelectedFilters,
    activeFilterPills,
    activeFilterCount: activeFilterPills.length,
  };
}
