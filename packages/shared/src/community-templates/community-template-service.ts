import { UserModel } from '@shared/auth/user-model';
import { verifySuspensionState, verifyWriteAccess } from '@shared/auth/authorization-service';
import { db } from '@shared/db';
import { PgTransactionObject } from '@shared/db/types';
import { dbGetAssistantById } from '@shared/db/functions/assistants';
import { dbGetCharacterById } from '@shared/db/functions/character';
import { dbGetLearningScenarioById } from '@shared/db/functions/learning-scenario';
import {
  CommunityTemplateRequestEventSelectModel,
  CommunityTemplateRequestSelectModel,
  templateRequestStatusSchema,
} from '@shared/db/schema';
import {
  checkParameterUUID,
  ForbiddenError,
  InvalidArgumentError,
  NotFoundError,
} from '@shared/error';
import { assertEntityType, EntityRef } from '@shared/entities/entity-types';
import {
  createCancelEvent,
  createSubmitEvent,
  createUserMessageEvent,
} from './community-template-request-event';
import {
  dbGetTemplateRequestForEntity,
  dbGetTemplateRequestWithEvents,
  dbInsertTemplateRequest,
  dbInsertTemplateRequestEvent,
  dbSetEntityCommunityShared,
  dbSetEntityHasLinkAccess,
  dbSetEntitySchoolShared,
  dbUpdateTemplateRequest,
  entityRefToInsertColumns,
} from './db-functions';
import { isCommunitySharingActive } from './community-sharing-state';

export type CommunityTemplateRequestWithEvents = CommunityTemplateRequestSelectModel & {
  events: CommunityTemplateRequestEventSelectModel[];
};

export type EntitySharingSnapshot = {
  isSchoolShared: boolean;
  isCommunityShared: boolean;
  hasLinkAccess: boolean;
};

/**
 * Fetches the referenced entity and verifies the user may manage its sharing settings.
 * Throws NotFoundError if the entity doesn't exist.
 */
async function getEntityAndVerifySharingAccess(
  entityRef: EntityRef,
  user: Pick<UserModel, 'id'>,
): Promise<EntitySharingSnapshot> {
  assertEntityType(entityRef.entityType);
  checkParameterUUID(entityRef.entityId);

  let entity;
  switch (entityRef.entityType) {
    case 'character':
      entity = await dbGetCharacterById({ characterId: entityRef.entityId });
      break;
    case 'assistant':
      entity = await dbGetAssistantById({ assistantId: entityRef.entityId });
      break;
    case 'learningScenario':
      entity = await dbGetLearningScenarioById({ learningScenarioId: entityRef.entityId });
      break;
  }

  if (!entity) {
    throw new NotFoundError(`${entityRef.entityType} not found`);
  }

  verifyWriteAccess({ item: entity, user });
  verifySuspensionState({ item: entity });

  return {
    isSchoolShared: entity.isSchoolShared,
    isCommunityShared: entity.isCommunityShared,
    hasLinkAccess: entity.hasLinkAccess,
  };
}

async function verifyTemplateRequestOwnership({
  templateRequest,
  user,
}: {
  templateRequest: CommunityTemplateRequestSelectModel;
  user: Pick<UserModel, 'id'>;
}) {
  if (templateRequest.createdBy !== user.id) {
    throw new ForbiddenError('User is not allowed to modify this community template request.');
  }
}

/**
 * Throws if community sharing is active, since it includes school and link sharing.
 */
export async function verifyCommunitySharingInactive({
  entityRef,
  isCommunityShared,
}: {
  entityRef: EntityRef;
  isCommunityShared: boolean;
}) {
  const request = await dbGetTemplateRequestForEntity(entityRef);
  if (isCommunitySharingActive({ isCommunityShared, requestState: request?.state })) {
    throw new InvalidArgumentError(
      'School and link sharing cannot be disabled while community sharing is active',
    );
  }
}

/**
 * Retrieves a community template request along with its associated events.
 */
export async function getCommunityTemplateRequestWithEvents({
  entityRef,
  user,
}: {
  entityRef: EntityRef;
  user: Pick<UserModel, 'id'>;
}): Promise<CommunityTemplateRequestWithEvents | null> {
  checkParameterUUID(entityRef.entityId);
  const requestWithEvents = await dbGetTemplateRequestWithEvents(entityRef);
  if (requestWithEvents === null) return null;

  await verifyTemplateRequestOwnership({ templateRequest: requestWithEvents, user });
  return requestWithEvents;
}

/**
 * Returns the current sharing state (school/community/link) and community template request for
 * an entity. Used by the frontend to resync its form after a failed mutation.
 */
export async function getEntitySharingState({
  entityRef,
  user,
}: {
  entityRef: EntityRef;
  user: Pick<UserModel, 'id'>;
}): Promise<{ request: CommunityTemplateRequestWithEvents | null; entity: EntitySharingSnapshot }> {
  const entity = await getEntityAndVerifySharingAccess(entityRef, user);
  const request = await dbGetTemplateRequestWithEvents(entityRef);
  return { request, entity };
}

/**
 * Creates a new community template request or resubmits a previously cancelled/rejected one.
 * Community sharing includes school and link sharing, so both are forced on.
 * Does not change isCommunityShared - that only happens once an admin approves the request.
 */
export async function createCommunityTemplateRequest({
  entityRef,
  user,
}: {
  entityRef: EntityRef;
  user: Pick<UserModel, 'id'>;
}): Promise<{ request: CommunityTemplateRequestWithEvents | null; entity: EntitySharingSnapshot }> {
  const entity = await getEntityAndVerifySharingAccess(entityRef, user);

  const existingRequest = await dbGetTemplateRequestForEntity(entityRef);

  async function enableSchoolAndLinkSharing(tx: PgTransactionObject) {
    if (!entity.hasLinkAccess) {
      await dbSetEntityHasLinkAccess(entityRef, true, tx);
    }
    if (!entity.isSchoolShared) {
      await dbSetEntitySchoolShared(entityRef, true, tx);
    }
  }

  if (existingRequest) {
    await verifyTemplateRequestOwnership({ templateRequest: existingRequest, user });
    await db.transaction(async (tx) => {
      await dbUpdateTemplateRequest({ id: existingRequest.id, state: 'submitted' }, tx);
      await dbInsertTemplateRequestEvent(createSubmitEvent(existingRequest.id, user.id), tx);
      await enableSchoolAndLinkSharing(tx);
    });
  } else {
    await db.transaction(async (tx) => {
      const createdRequest = await dbInsertTemplateRequest(
        { ...entityRefToInsertColumns(entityRef), createdBy: user.id, state: 'submitted' },
        tx,
      );
      await dbInsertTemplateRequestEvent(createSubmitEvent(createdRequest.id, user.id), tx);
      await enableSchoolAndLinkSharing(tx);
    });
  }

  const request = await dbGetTemplateRequestWithEvents(entityRef);
  return { request, entity: { ...entity, isSchoolShared: true, hasLinkAccess: true } };
}

/**
 * User cancels their own community template request.
 * If the entity had already been approved (isCommunityShared), this also revokes that
 * approval as part of the same transaction - isSchoolShared and hasLinkAccess are untouched.
 */
export async function cancelCommunityTemplateRequest({
  entityRef,
  user,
}: {
  entityRef: EntityRef;
  user: Pick<UserModel, 'id'>;
}): Promise<{ request: CommunityTemplateRequestWithEvents | null; entity: EntitySharingSnapshot }> {
  const entity = await getEntityAndVerifySharingAccess(entityRef, user);

  const existingRequest = await dbGetTemplateRequestForEntity(entityRef);
  if (!existingRequest) {
    throw new NotFoundError('No community template request found for this entity');
  }
  await verifyTemplateRequestOwnership({ templateRequest: existingRequest, user });

  const cancelledEvent = createCancelEvent(existingRequest.id, user.id);
  await db.transaction(async (tx) => {
    await dbInsertTemplateRequestEvent(cancelledEvent, tx);
    await dbUpdateTemplateRequest(
      {
        id: existingRequest.id,
        state: templateRequestStatusSchema.enum.cancelled,
      },
      tx,
    );
    if (entity.isCommunityShared) {
      await dbSetEntityCommunityShared(entityRef, false, tx);
    }
  });

  const request = await dbGetTemplateRequestWithEvents(entityRef);
  return { request, entity: { ...entity, isCommunityShared: false } };
}

/**
 * User sends a message to the editors regarding their community template request.
 */
export async function sendMessageToEditor({
  entityRef,
  user,
  message,
}: {
  entityRef: EntityRef;
  user: Pick<UserModel, 'id'>;
  message: string;
}): Promise<{ request: CommunityTemplateRequestWithEvents | null; entity: EntitySharingSnapshot }> {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    throw new InvalidArgumentError('Message must not be empty');
  }

  const entity = await getEntityAndVerifySharingAccess(entityRef, user);

  const existingRequest = await dbGetTemplateRequestForEntity(entityRef);
  if (!existingRequest) {
    throw new NotFoundError('No community template request found for this entity');
  }
  await verifyTemplateRequestOwnership({ templateRequest: existingRequest, user });

  await dbInsertTemplateRequestEvent(
    createUserMessageEvent(existingRequest.id, user.id, trimmedMessage),
  );

  const request = await dbGetTemplateRequestWithEvents(entityRef);
  return { request, entity };
}
