'use client';

import type { EntityRef } from '@shared/entities/entity-types';
import { useState } from 'react';

import { FavoriteButton } from '@/components/common/favorite-button';
import { useSetFavorite } from '@/components/hooks/use-set-favorite';

export function CustomChatActionFavorite({
  entityRef,
  initialIsFavorite,
  isSuspended = false,
}: {
  entityRef: EntityRef;
  initialIsFavorite: boolean;
  isSuspended?: boolean;
}) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const setFavorite = useSetFavorite();

  async function handleToggle(nextIsFavorite: boolean) {
    setIsFavorite(nextIsFavorite);
    const success = await setFavorite(entityRef, nextIsFavorite);
    if (!success) setIsFavorite(!nextIsFavorite);
  }

  return (
    <FavoriteButton
      isFavorite={isFavorite}
      disabled={isSuspended && !isFavorite}
      onToggle={handleToggle}
    />
  );
}
