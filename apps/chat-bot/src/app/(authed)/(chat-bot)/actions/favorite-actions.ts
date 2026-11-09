'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import type { EntityType } from '@shared/entities/entity-types';
import { setFavorite } from '@shared/favorites/favorite-service';

import { requireAuth } from '@/auth/requireAuth';

export async function setFavoriteAction({
  entityType,
  entityId,
  isFavorite,
}: {
  entityType: EntityType;
  entityId: string;
  isFavorite: boolean;
}) {
  const { user } = await requireAuth();
  return runServerAction(
    'setFavoriteAction',
    setFavorite,
  )({
    entityType,
    entityId,
    isFavorite,
    user,
  });
}
