'use client';

import type { EntityType } from '@shared/entities/entity-types';
import type { OverviewFilter } from '@shared/overview-filter';
import { overviewFilterSchema } from '@shared/overview-filter';
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  readSessionStorage,
  useSessionStorageState,
  writeSessionStorage,
} from '@/hooks/use-session-storage-state';

function parseFilter(value: string | null): OverviewFilter | null {
  const result = overviewFilterSchema.safeParse(value);
  return result.success ? result.data : null;
}

function getFilterFromURL(): OverviewFilter | null {
  return parseFilter(new URLSearchParams(window.location.search).get('filter'));
}

function resolveFilter(stored: string | null): OverviewFilter {
  if (stored) {
    return parseFilter(stored) ?? 'mine';
  }
  // Legacy bookmark support: read URL param when nothing is stored
  return getFilterFromURL() ?? 'mine';
}

/**
 * Hook to manage overview filter state using session storage.
 * Calls onLoad on mount with the initial filter (from session storage or legacy URL param).
 * Supports legacy URL params for backward compatibility with old bookmarks.
 *
 * @param entityType - The type of entity
 * @param onLoad - Callback to fetch entities for a given filter (called on mount and on change)
 * @returns [filter, setFilter, isLoading]
 */
export function usePersistedOverviewFilter(
  entityType: EntityType,
  onLoad: (filter: OverviewFilter) => Promise<void>,
): [OverviewFilter, (filter: OverviewFilter) => Promise<void>, boolean] {
  const sessionStorageKey = `overview-filter-${entityType}`;

  // Persist the legacy URL param so it survives navigation without the param
  useLayoutEffect(() => {
    const urlFilter = getFilterFromURL();
    if (urlFilter && !readSessionStorage(sessionStorageKey)) {
      writeSessionStorage(sessionStorageKey, urlFilter);
    }
  }, [sessionStorageKey]);

  // null on the server, so no data is loaded before the client knows the stored filter
  const [filter, setStoredFilter] = useSessionStorageState<OverviewFilter | null>(
    sessionStorageKey,
    resolveFilter,
    null,
  );
  const selectedFilter = filter ?? 'mine';
  const [isLoading, setIsLoading] = useState(true);
  const onLoadRef = useRef(onLoad);
  const lastLoadedFilterRef = useRef<OverviewFilter | null>(null);

  useEffect(() => {
    onLoadRef.current = onLoad;
  });

  // Load data when filter is changed
  useEffect(() => {
    if (lastLoadedFilterRef.current === filter) {
      return;
    }
    if (filter) {
      lastLoadedFilterRef.current = filter;
      onLoadRef.current(filter).finally(() => startTransition(() => setIsLoading(false)));
    }
  }, [filter]);

  const setFilter = useCallback(
    async (newFilter: OverviewFilter) => {
      setStoredFilter(newFilter);
      setIsLoading(true);
    },
    [setStoredFilter],
  );

  return [selectedFilter, setFilter, isLoading];
}
