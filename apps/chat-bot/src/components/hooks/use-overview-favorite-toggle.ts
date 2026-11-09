'use client';

import type { EntityType } from '@shared/entities/entity-types';
import type { OverviewFilter } from '@shared/overview-filter';
import { useCallback, useEffect, useRef } from 'react';

import { applyFavoriteChange } from '@/components/entity-overview/utils';
import { useSetFavorite } from '@/components/hooks/use-set-favorite';

/**
 * Toggles a favorite in an overview optimistically and reloads the list if saving fails,
 * unless the user switched to another tab in the meantime.
 */
export function useOverviewFavoriteToggle<T extends { id: string; isFavorite: boolean }>({
  entityType,
  activeFilter,
  setEntities,
  reload,
}: {
  entityType: EntityType;
  activeFilter: OverviewFilter;
  setEntities: (update: (previous: T[]) => T[]) => void;
  reload: (filter: OverviewFilter) => Promise<void>;
}) {
  const setFavorite = useSetFavorite();
  const activeFilterRef = useRef(activeFilter);

  useEffect(() => {
    activeFilterRef.current = activeFilter;
  });

  return useCallback(
    async (entityId: string, isFavorite: boolean) => {
      const filterAtToggle = activeFilterRef.current;
      setEntities((previous) =>
        applyFavoriteChange(previous, entityId, isFavorite, filterAtToggle),
      );

      const success = await setFavorite({ entityType, entityId }, isFavorite);
      if (!success && activeFilterRef.current === filterAtToggle) await reload(filterAtToggle);
    },
    [entityType, setEntities, setFavorite, reload],
  );
}
