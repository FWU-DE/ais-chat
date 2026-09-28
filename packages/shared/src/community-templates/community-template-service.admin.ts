import { db } from '@shared/db';
import { dbUpdateAssistantAccessLevel } from '@shared/db/functions/assistants';
import { dbUpdateCharacterAccessLevel } from '@shared/db/functions/character';
import { dbUpdateLearningScenarioAccessLevel } from '@shared/db/functions/learning-scenario';
import {
  assistantTable,
  characterTable,
  CommunityTemplateRequestEventSelectModel,
  CommunityTemplateRequestEventTable,
  CommunityTemplateRequestSelectModel,
  CommunityTemplateRequestTable,
  learningScenarioTable,
  templateRequestCreatorRoleSchema,
} from '@shared/db/schema';
import { EntityType } from '@shared/entities/entity-types';
import { InvalidArgumentError, NotFoundError } from '@shared/error';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

export type CommunityTemplateRequestSummary = CommunityTemplateRequestSelectModel & {
  entityName: string;
  entityType: EntityType;
  latestEventCreatedAt: Date;
  latestEventCreatedByRole: z.infer<typeof templateRequestCreatorRoleSchema>;
};

export type CommunityTemplateRequestWithEventsAdmin = CommunityTemplateRequestSelectModel & {
  entityName: string;
  entityType: EntityType;
  events: CommunityTemplateRequestEventSelectModel[];
};

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
 * Returns all community template requests for the list view in admin app.
 * Each record includes the entity id, name and type as well as the latest event information.
 */
export async function getCommunityTemplateRequests(): Promise<CommunityTemplateRequestSummary[]> {
  const latestEvent = latestTemplateRequestEvent();
  const rows = await db
    .select({
      request: CommunityTemplateRequestTable,
      // exactly one of assistantId, characterId, learningScenarioId is set per request
      entityName: sql<string>`coalesce(${assistantTable.name}, ${characterTable.name}, ${learningScenarioTable.name})`,
      entityType: sql<EntityType>`case 
        when ${CommunityTemplateRequestTable.assistantId} is not null then ${'assistant' satisfies EntityType}
        when ${CommunityTemplateRequestTable.characterId} is not null then ${'character' satisfies EntityType}
        when ${CommunityTemplateRequestTable.learningScenarioId} is not null then ${'learningScenario' satisfies EntityType}
      end`,
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

  return rows.map(
    ({ request, entityName, entityType, latestEventCreatedAt, latestEventCreatedByRole }) => ({
      ...request,
      entityName,
      entityType,
      latestEventCreatedAt,
      latestEventCreatedByRole,
    }),
  );
}

/**
 * Returns the community template request along with all its events for the admin view.
 * Also includes the entity id, name and type.
 */
export async function getCommunityTemplateRequestWithEventsForAdmin(
  requestId: string,
): Promise<CommunityTemplateRequestWithEventsAdmin> {
  const rows = await db
    .select({
      request: CommunityTemplateRequestTable,
      entityName: sql<string>`coalesce(${assistantTable.name}, ${characterTable.name}, ${learningScenarioTable.name})`,
      entityType: sql<EntityType>`case 
        when ${CommunityTemplateRequestTable.assistantId} is not null then ${'assistant' satisfies EntityType}
        when ${CommunityTemplateRequestTable.characterId} is not null then ${'character' satisfies EntityType}
        when ${CommunityTemplateRequestTable.learningScenarioId} is not null then ${'learningScenario' satisfies EntityType}
      end`,
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

  const firstRow = rows[0];
  if (!firstRow) throw new NotFoundError('Community template request not found');

  return {
    ...firstRow.request,
    entityName: firstRow.entityName,
    entityType: firstRow.entityType,
    events: rows.map(({ event }) => event),
  };
}

/**
 * Editor users can update the internal note on a request.
 */
export async function updateInternalNote(requestId: string, note: string): Promise<void> {
  await db
    .update(CommunityTemplateRequestTable)
    .set({ note: note })
    .where(eq(CommunityTemplateRequestTable.id, requestId));
}

/**
 * Editor users can approve a community template request so that it is visible to the community.
 * Sets the access level of the referenced entity to 'community' within the same transaction.
 */
export async function approveRequest(
  requestId: string,
  editorId: string,
  editorName: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(CommunityTemplateRequestTable)
      .where(eq(CommunityTemplateRequestTable.id, requestId));

    if (!request) throw new NotFoundError('Community template request not found');
    if (request.state !== 'submitted' && request.state !== 'rejected')
      throw new InvalidArgumentError('Transition to approved state is not possible.');

    await tx
      .update(CommunityTemplateRequestTable)
      .set({ state: 'approved' })
      .where(eq(CommunityTemplateRequestTable.id, requestId));

    await tx.insert(CommunityTemplateRequestEventTable).values({
      templateRequestId: requestId,
      eventType: 'approve',
      createdByRole: 'editor',
      createdById: editorId,
      createdByName: editorName,
      message: 'Request approved',
    });

    // exactly one of assistantId, characterId, learningScenarioId is set per request
    if (request.characterId !== null) {
      await dbUpdateCharacterAccessLevel(request.characterId, 'community', tx);
    } else if (request.assistantId !== null) {
      await dbUpdateAssistantAccessLevel(request.assistantId, 'community', tx);
    } else if (request.learningScenarioId !== null) {
      await dbUpdateLearningScenarioAccessLevel(request.learningScenarioId, 'community', tx);
    }
  });
}

export async function rejectRequest(
  requestId: string,
  editorId: string,
  editorName: string,
  message: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(CommunityTemplateRequestTable)
      .set({ state: 'rejected' })
      .where(eq(CommunityTemplateRequestTable.id, requestId));

    await tx.insert(CommunityTemplateRequestEventTable).values({
      templateRequestId: requestId,
      eventType: 'reject',
      createdByRole: 'editor',
      createdById: editorId,
      createdByName: editorName,
      message: message,
    });
  });
}

export async function sendMessageToAuthor(
  requestId: string,
  editorId: string,
  editorName: string,
  message: string,
): Promise<void> {
  await db.insert(CommunityTemplateRequestEventTable).values({
    templateRequestId: requestId,
    eventType: 'editor_message',
    createdByRole: 'editor',
    createdById: editorId,
    createdByName: editorName,
    message: message,
  });
}
