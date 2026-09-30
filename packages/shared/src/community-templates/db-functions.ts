import { db } from '@shared/db';
import {
  CommunityTemplateRequestEventInsertModel,
  CommunityTemplateRequestEventTable,
  CommunityTemplateRequestInsertModel,
  CommunityTemplateRequestTable,
  CommunityTemplateRequestUpdateModel,
} from '@shared/db/schema';
import { PgTransactionObject } from '@shared/db/types';
import { EntityRef } from '@shared/entities/entity-types';
import {
  dbUpdateAssistantCommunityShared,
  dbUpdateAssistantHasLinkAccess,
} from '@shared/db/functions/assistants';
import {
  dbUpdateCharacterCommunityShared,
  dbUpdateCharacterHasLinkAccess,
} from '@shared/db/functions/character';
import {
  dbUpdateLearningScenarioCommunityShared,
  dbUpdateLearningScenarioHasLinkAccess,
} from '@shared/db/functions/learning-scenario';
import { desc, eq } from 'drizzle-orm';

/**
 * Builds the where-clause matching the single foreign key column populated for the given entity type.
 */
function entityRefWhereClause(entityRef: EntityRef) {
  switch (entityRef.entityType) {
    case 'character':
      return eq(CommunityTemplateRequestTable.characterId, entityRef.entityId);
    case 'assistant':
      return eq(CommunityTemplateRequestTable.assistantId, entityRef.entityId);
    case 'learningScenario':
      return eq(CommunityTemplateRequestTable.learningScenarioId, entityRef.entityId);
  }
}

/**
 * Builds the insert values for the single foreign key column matching the given entity type.
 */
export function entityRefToInsertColumns(entityRef: EntityRef) {
  return {
    characterId: entityRef.entityType === 'character' ? entityRef.entityId : undefined,
    assistantId: entityRef.entityType === 'assistant' ? entityRef.entityId : undefined,
    learningScenarioId:
      entityRef.entityType === 'learningScenario' ? entityRef.entityId : undefined,
  };
}

/**
 * Inserts a new community template request in database.
 */
export async function dbInsertTemplateRequest(
  request: CommunityTemplateRequestInsertModel,
  tx: PgTransactionObject,
) {
  const [insertedRequest] = await tx
    .insert(CommunityTemplateRequestTable)
    .values(request)
    .returning();

  if (!insertedRequest) {
    throw new Error('Could not insert the community template request');
  }
  return insertedRequest;
}

/**
 * Updates an existing community template request in the database.
 */
export async function dbUpdateTemplateRequest(
  { id, state, note }: Pick<CommunityTemplateRequestUpdateModel, 'id' | 'state' | 'note'>,
  tx: PgTransactionObject,
) {
  const [updatedRequest] = await tx
    .update(CommunityTemplateRequestTable)
    .set({
      ...(state !== undefined ? { state: state } : {}),
      ...(note !== undefined ? { note: note } : {}),
    })
    .where(eq(CommunityTemplateRequestTable.id, id))
    .returning();

  if (!updatedRequest) {
    throw new Error('Could not update the community template request');
  }
  return updatedRequest;
}

/**
 * Returns the community template request for the given entity, or undefined if none exists.
 */
export async function dbGetTemplateRequestForEntity(entityRef: EntityRef) {
  const [request] = await db
    .select()
    .from(CommunityTemplateRequestTable)
    .where(entityRefWhereClause(entityRef))
    .limit(1);

  return request;
}

/**
 * Returns the community template request along with its associated events,
 * or null if no request exists for the given entity.
 */
export async function dbGetTemplateRequestWithEvents(entityRef: EntityRef) {
  const requestWithEvents = await db
    .select()
    .from(CommunityTemplateRequestTable)
    .where(entityRefWhereClause(entityRef))
    .innerJoin(
      CommunityTemplateRequestEventTable,
      eq(CommunityTemplateRequestEventTable.templateRequestId, CommunityTemplateRequestTable.id),
    )
    .orderBy(
      CommunityTemplateRequestTable.createdAt,
      desc(CommunityTemplateRequestEventTable.createdAt),
    );

  const [firstRow] = requestWithEvents;
  if (!firstRow) {
    return null;
  }

  return {
    ...firstRow.community_template_request,
    events: requestWithEvents.map((row) => row.community_template_request_events),
  };
}

/**
 * Inserts a new community template request event in database.
 */
export async function dbInsertTemplateRequestEvent(
  event: CommunityTemplateRequestEventInsertModel,
  tx: PgTransactionObject,
) {
  const [insertedEvent] = await tx
    .insert(CommunityTemplateRequestEventTable)
    .values(event)
    .returning();
  if (!insertedEvent) {
    throw new Error('Could not insert the community template request event');
  }
  return insertedEvent;
}

/**
 * Dispatches the community-shared flag update to the db function matching the entity's type.
 * Used by both the owner-facing cancel flow and the admin approve/reject flow.
 */
export async function dbSetEntityCommunityShared(
  entityRef: EntityRef,
  isCommunityShared: boolean,
  tx: PgTransactionObject,
): Promise<void> {
  switch (entityRef.entityType) {
    case 'character':
      return dbUpdateCharacterCommunityShared(entityRef.entityId, isCommunityShared, tx);
    case 'assistant':
      return dbUpdateAssistantCommunityShared(entityRef.entityId, isCommunityShared, tx);
    case 'learningScenario':
      return dbUpdateLearningScenarioCommunityShared(entityRef.entityId, isCommunityShared, tx);
  }
}

/**
 * Dispatches the hasLinkAccess flag update to the db function matching the entity's type.
 * Forced to true whenever a community template request is submitted or resubmitted, so admins
 * reviewing the request can access the entity via link.
 */
export async function dbSetEntityHasLinkAccess(
  entityRef: EntityRef,
  hasLinkAccess: boolean,
  tx: PgTransactionObject,
): Promise<void> {
  switch (entityRef.entityType) {
    case 'character':
      return dbUpdateCharacterHasLinkAccess(entityRef.entityId, hasLinkAccess, tx);
    case 'assistant':
      return dbUpdateAssistantHasLinkAccess(entityRef.entityId, hasLinkAccess, tx);
    case 'learningScenario':
      return dbUpdateLearningScenarioHasLinkAccess(entityRef.entityId, hasLinkAccess, tx);
  }
}
