'use client';

import type { EntityType } from '@shared/entities/entity-types';
import type { OverviewFilter } from '@shared/overview-filter';
import { overviewFilterSchema } from '@shared/overview-filter';
import { useLayoutEffect } from 'react';

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
 * Supports legacy URL params for backward compatibility with old bookmarks.
 *
 * @param entityType - The type of entity
 * @returns [filter, setFilter, isFilterResolved] - isFilterResolved is false until the client
 * has read the stored filter (server render and hydration)
 */
export function usePersistedOverviewFilter(
  entityType: EntityType,
): [OverviewFilter, (filter: OverviewFilter) => void, boolean] {
  const sessionStorageKey = `overview-filter-${entityType}`;

  // Persist the legacy URL param so it survives navigation without the param
  useLayoutEffect(() => {
    const urlFilter = getFilterFromURL();
    if (urlFilter && !readSessionStorage(sessionStorageKey)) {
      writeSessionStorage(sessionStorageKey, urlFilter);
    }
  }, [sessionStorageKey]);

  const [filter, setFilter] = useSessionStorageState<OverviewFilter | null>(
    sessionStorageKey,
    resolveFilter,
    null,
  );

  return [filter ?? 'mine', setFilter, filter !== null];
}
