import { verifyReadAccess, verifySuspensionState } from '@shared/auth/authorization-service';
import { UserModel } from '@shared/auth/user-model';
import { dbGetAssistantById } from '@shared/db/functions/assistants';
import { dbGetCharacterById } from '@shared/db/functions/character';
import { dbGetLearningScenarioById } from '@shared/db/functions/learning-scenario';
import {
  dbAddUserFavorite,
  dbGetUserFavoriteEntityIds,
  dbIsUserFavorite,
  dbRemoveUserFavorite,
} from '@shared/db/functions/user-favorites';
import {
  assertEntityType,
  EntityRef,
  EntityType,
  throwEntityInvalidArgumentError,
} from '@shared/entities/entity-types';
import { checkParameterUUID, NotFoundError } from '@shared/error';

async function getEntityForReadAccess({ entityType, entityId }: EntityRef) {
  switch (entityType) {
    case 'assistant':
      return dbGetAssistantById({ assistantId: entityId });
    case 'character':
      return dbGetCharacterById({ characterId: entityId });
    case 'learningScenario':
      return dbGetLearningScenarioById({ learningScenarioId: entityId });
    default:
      throwEntityInvalidArgumentError();
  }
}

/**
 * Marks or unmarks an entity as favorite of the user.
 * Marking requires read access to a non-suspended entity. Unmarking is always allowed,
 * so favorites of entities that are no longer accessible can still be removed.
 */
export async function setFavorite({
  entityType,
  entityId,
  isFavorite,
  user,
}: EntityRef & {
  isFavorite: boolean;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}) {
  assertEntityType(entityType);
  checkParameterUUID(entityId);
  const entityRef = { entityType, entityId };

  if (!isFavorite) {
    await dbRemoveUserFavorite({ userId: user.id, entityRef });
    return;
  }

  const entity = await getEntityForReadAccess(entityRef);
  if (!entity) throw new NotFoundError(`${entityType} not found`);
  verifyReadAccess({ item: entity, user });
  verifySuspensionState({ item: entity });

  await dbAddUserFavorite({ userId: user.id, entityRef });
}

export type WithFavorite<T> = T & { isFavorite: boolean };

export async function isFavorite({
  entityType,
  entityId,
  user,
}: EntityRef & { user: Pick<UserModel, 'id'> }): Promise<boolean> {
  assertEntityType(entityType);
  checkParameterUUID(entityId);
  return dbIsUserFavorite({ userId: user.id, entityRef: { entityType, entityId } });
}

export async function getFavoriteEntityIds({
  entityType,
  user,
}: {
  entityType: EntityType;
  user: Pick<UserModel, 'id'>;
}): Promise<string[]> {
  assertEntityType(entityType);
  return dbGetUserFavoriteEntityIds({ userId: user.id, entityType });
}
