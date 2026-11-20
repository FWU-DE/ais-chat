'use client';

import type { EntityType } from '@shared/entities/entity-types';
import type { OverviewFilter } from '@shared/overview-filter';
import { useCallback, useEffect, useRef } from 'react';

import { applyFavoriteChange, revertFavoriteChange } from '@/components/entity-overview/utils';
import { useSetFavorite } from '@/components/hooks/use-set-favorite';

/**
 * Toggles a favorite in an overview optimistically and rolls back only the affected entity
 * if saving fails, unless the user switched to another tab in the meantime.
 */
export function useOverviewFavoriteToggle<T extends { id: string; isFavorite: boolean }>({
  entityType,
  activeFilter,
  entities,
  setEntities,
}: {
  entityType: EntityType;
  activeFilter: OverviewFilter;
  entities: T[];
  setEntities: (update: (previous: T[]) => T[]) => void;
}) {
  const setFavorite = useSetFavorite();
  const activeFilterRef = useRef(activeFilter);
  const entitiesRef = useRef(entities);

  useEffect(() => {
    activeFilterRef.current = activeFilter;
    entitiesRef.current = entities;
  });

  return useCallback(
    async (entityId: string, isFavorite: boolean) => {
      const filterAtToggle = activeFilterRef.current;
      const previousEntity = entitiesRef.current.find((entity) => entity.id === entityId);
      setEntities((previous) =>
        applyFavoriteChange(previous, entityId, isFavorite, filterAtToggle),
      );

      const success = await setFavorite({ entityType, entityId }, isFavorite);
      if (!success && previousEntity && activeFilterRef.current === filterAtToggle) {
        setEntities((previous) => revertFavoriteChange(previous, previousEntity));
      }
    },
    [entityType, setEntities, setFavorite],
  );
}
