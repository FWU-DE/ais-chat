import { db } from '@shared/db';
import { dbUpdateAssistantAccessLevel } from '@shared/db/functions/assistants';
import { dbUpdateCharacterAccessLevel } from '@shared/db/functions/character';
import { dbUpdateLearningScenarioAccessLevel } from '@shared/db/functions/learning-scenario';
import {
  AccessLevel,
  assistantTable,
  characterTable,
  CommunityTemplateRequestEventInsertModel,
  CommunityTemplateRequestEventTable,
  CommunityTemplateRequestSelectModel,
  CommunityTemplateRequestTable,
  learningScenarioTable,
  TemplateRequestStatus,
} from '@shared/db/schema';
import { PgTransactionObject } from '@shared/db/types';
import { EntityRef } from '@shared/entities/entity-types';
import { and, asc, desc, eq, or } from 'drizzle-orm';

/**
 * Selects only the single latest event per template request via
 * `DISTINCT ON (template_request_id) ORDER BY created_at DESC`.
 */
function latestTemplateRequestEvent() {
  return db
    .selectDistinctOn([CommunityTemplateRequestEventTable.templateRequestId], {
      templateRequestId: CommunityTemplateRequestEventTable.templateRequestId,
      createdAt: CommunityTemplateRequestEventTable.createdAt,
      createdByRole: CommunityTemplateRequestEventTable.createdByRole,
    })
    .from(CommunityTemplateRequestEventTable)
    .orderBy(
      CommunityTemplateRequestEventTable.templateRequestId,
      desc(CommunityTemplateRequestEventTable.createdAt),
    )
    .as('latest_event');
}

/**
 * Returns raw rows for all community template requests, joined with the entity name
 * columns (exactly one populated per row) and the latest event info.
 */
export async function dbGetCommunityTemplateRequestRows() {
  const latestEvent = latestTemplateRequestEvent();
  return db
    .select({
      request: CommunityTemplateRequestTable,
      assistantName: assistantTable.name,
      characterName: characterTable.name,
      learningScenarioName: learningScenarioTable.name,
      latestEventCreatedAt: latestEvent.createdAt,
      latestEventCreatedByRole: latestEvent.createdByRole,
    })
    .from(CommunityTemplateRequestTable)
    .leftJoin(assistantTable, eq(CommunityTemplateRequestTable.assistantId, assistantTable.id))
    .leftJoin(characterTable, eq(CommunityTemplateRequestTable.characterId, characterTable.id))
    .leftJoin(
      learningScenarioTable,
      eq(CommunityTemplateRequestTable.learningScenarioId, learningScenarioTable.id),
    )
    .innerJoin(latestEvent, eq(latestEvent.templateRequestId, CommunityTemplateRequestTable.id))
    .orderBy(CommunityTemplateRequestTable.createdAt);
}

/**
 * Returns raw rows for a single community template request joined with its entity name
 * columns (exactly one populated per row) and all of its events.
 */
export async function dbGetCommunityTemplateRequestWithEventsRows(requestId: string) {
  return db
    .select({
      request: CommunityTemplateRequestTable,
      assistantName: assistantTable.name,
      characterName: characterTable.name,
      learningScenarioName: learningScenarioTable.name,
      event: CommunityTemplateRequestEventTable,
    })
    .from(CommunityTemplateRequestTable)
    .leftJoin(assistantTable, eq(CommunityTemplateRequestTable.assistantId, assistantTable.id))
    .leftJoin(characterTable, eq(CommunityTemplateRequestTable.characterId, characterTable.id))
    .leftJoin(
      learningScenarioTable,
      eq(CommunityTemplateRequestTable.learningScenarioId, learningScenarioTable.id),
    )
    .innerJoin(
      CommunityTemplateRequestEventTable,
      eq(CommunityTemplateRequestEventTable.templateRequestId, CommunityTemplateRequestTable.id),
    )
    .where(eq(CommunityTemplateRequestTable.id, requestId))
    .orderBy(asc(CommunityTemplateRequestEventTable.createdAt));
}

export async function dbUpdateInternalNote(requestId: string, note: string): Promise<void> {
  await db
    .update(CommunityTemplateRequestTable)
    .set({ note })
    .where(eq(CommunityTemplateRequestTable.id, requestId));
}

export async function dbGetRequestById(
  requestId: string,
  tx: PgTransactionObject,
): Promise<CommunityTemplateRequestSelectModel | undefined> {
  const [existing] = await tx
    .select()
    .from(CommunityTemplateRequestTable)
    .where(eq(CommunityTemplateRequestTable.id, requestId));
  return existing;
}

/**
 * Conditionally transitions a request to `newState`, but only if its current state is one of
 * `allowedStates`. Returns the updated row, or `undefined` if no row matched (either the request
 * doesn't exist or its state doesn't allow the transition) - callers must distinguish those cases.
 */
export async function dbConditionalTransitionState(
  requestId: string,
  newState: TemplateRequestStatus,
  allowedStates: TemplateRequestStatus[],
  tx: PgTransactionObject,
): Promise<CommunityTemplateRequestSelectModel | undefined> {
  const [request] = await tx
    .update(CommunityTemplateRequestTable)
    .set({ state: newState })
    .where(
      and(
        eq(CommunityTemplateRequestTable.id, requestId),
        or(...allowedStates.map((state) => eq(CommunityTemplateRequestTable.state, state))),
      ),
    )
    .returning();
  return request;
}

export async function dbInsertTemplateRequestEvent(
  event: CommunityTemplateRequestEventInsertModel,
  tx: PgTransactionObject,
): Promise<void> {
  await tx.insert(CommunityTemplateRequestEventTable).values(event);
}

/**
 * Dispatches the access-level update to the db function matching the entity's type.
 */
export async function dbUpdateEntityAccessLevel(
  entityRef: EntityRef,
  accessLevel: AccessLevel,
  tx: PgTransactionObject,
): Promise<void> {
  switch (entityRef.entityType) {
    case 'character':
      return dbUpdateCharacterAccessLevel(entityRef.entityId, accessLevel, tx);
    case 'assistant':
      return dbUpdateAssistantAccessLevel(entityRef.entityId, accessLevel, tx);
    case 'learningScenario':
      return dbUpdateLearningScenarioAccessLevel(entityRef.entityId, accessLevel, tx);
  }
}
