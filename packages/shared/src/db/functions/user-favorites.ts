import { EntityRef, EntityType } from '@shared/entities/entity-types';
import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '..';
import { userFavoriteTable } from '../schema';

function getFavoriteEntityColumn(entityType: EntityType) {
  switch (entityType) {
    case 'assistant':
      return userFavoriteTable.assistantId;
    case 'character':
      return userFavoriteTable.characterId;
    case 'learningScenario':
      return userFavoriteTable.learningScenarioId;
  }
}

function entityRefToFavoriteColumns({ entityType, entityId }: EntityRef) {
  return {
    assistantId: entityType === 'assistant' ? entityId : undefined,
    characterId: entityType === 'character' ? entityId : undefined,
    learningScenarioId: entityType === 'learningScenario' ? entityId : undefined,
  };
}

export async function dbAddUserFavorite({
  userId,
  entityRef,
}: {
  userId: string;
  entityRef: EntityRef;
}) {
  await db
    .insert(userFavoriteTable)
    .values({ userId, ...entityRefToFavoriteColumns(entityRef) })
    .onConflictDoNothing();
}

export async function dbRemoveUserFavorite({
  userId,
  entityRef,
}: {
  userId: string;
  entityRef: EntityRef;
}) {
  await db
    .delete(userFavoriteTable)
    .where(
      and(
        eq(userFavoriteTable.userId, userId),
        eq(getFavoriteEntityColumn(entityRef.entityType), entityRef.entityId),
      ),
    );
}

export async function dbIsUserFavorite({
  userId,
  entityRef,
}: {
  userId: string;
  entityRef: EntityRef;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: userFavoriteTable.id })
    .from(userFavoriteTable)
    .where(
      and(
        eq(userFavoriteTable.userId, userId),
        eq(getFavoriteEntityColumn(entityRef.entityType), entityRef.entityId),
      ),
    )
    .limit(1);

  return row !== undefined;
}

export async function dbGetUserFavoriteEntityIds({
  userId,
  entityType,
}: {
  userId: string;
  entityType: EntityType;
}): Promise<string[]> {
  const column = getFavoriteEntityColumn(entityType);
  const rows = await db
    .select({ entityId: column })
    .from(userFavoriteTable)
    .where(and(eq(userFavoriteTable.userId, userId), isNotNull(column)));

  return rows.flatMap((row) => (row.entityId ? [row.entityId] : []));
}
