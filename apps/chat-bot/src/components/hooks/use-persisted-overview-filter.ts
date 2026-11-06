'use client';

import type { OverviewFilter } from '@shared/overview-filter';
import { overviewFilterSchema } from '@shared/overview-filter';
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

export type EntityType = 'characters' | 'learning-scenarios' | 'assistants';

function parseFilter(value: string | null): OverviewFilter | null {
  const result = overviewFilterSchema.safeParse(value);
  return result.success ? result.data : null;
}

function getFilterFromURL(): OverviewFilter | null {
  return parseFilter(new URLSearchParams(window.location.search).get('filter'));
}

function resolveInitialFilter(sessionStorageKey: string): OverviewFilter {
  try {
    const stored = sessionStorage.getItem(sessionStorageKey);
    if (stored) {
      return parseFilter(stored) ?? 'mine';
    }
    // Legacy bookmark support: read URL param once on mount
    const urlFilter = getFilterFromURL();
    if (urlFilter) {
      return urlFilter;
    }
  } catch {
    // Storage access might be blocked
  }
  return 'mine';
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

  // Initialize sessionStorage from URL param before useSyncExternalStore reads it
  useLayoutEffect(() => {
    try {
      const urlFilter = getFilterFromURL();
      if (urlFilter && !sessionStorage.getItem(sessionStorageKey)) {
        sessionStorage.setItem(sessionStorageKey, urlFilter);
      }
    } catch {
      // Storage access might be blocked
    }
  }, [sessionStorageKey]);

  // useSyncExternalStore provides the sessionStorage value synchronously on the client
  // and null as a server snapshot, preventing SSR crashes.
  const sessionStorageFilter = useSyncExternalStore<OverviewFilter | null>(
    () => () => {},
    () => resolveInitialFilter(sessionStorageKey),
    () => null,
  );
  // manualFilter holds user-initiated changes; null means "use sessionStorageFilter"
  const [manualFilter, setManualFilter] = useState<OverviewFilter | null>(null);
  const filter = manualFilter ?? sessionStorageFilter;
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
      try {
        sessionStorage.setItem(sessionStorageKey, newFilter);
      } catch {
        // Storage access might be blocked
      }

      setManualFilter(newFilter);
      setIsLoading(true);
    },
    [sessionStorageKey],
  );

  return [selectedFilter, setFilter, isLoading];
}
