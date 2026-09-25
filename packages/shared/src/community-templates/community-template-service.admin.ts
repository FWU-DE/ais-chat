import { db } from '@shared/db';
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
import { NotFoundError } from '@shared/error';
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

export async function updateInternalNote(requestId: string, note: string): Promise<void> {
  await db
    .update(CommunityTemplateRequestTable)
    .set({ note: note })
    .where(eq(CommunityTemplateRequestTable.id, requestId));
}

export async function approveRequest(
  requestId: string,
  editorId: string,
  editorName: string,
): Promise<void> {
  await db.transaction(async (tx) => {
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

    // Todo: We also have to update the internal state of the character, assistantant, learning scenario
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
