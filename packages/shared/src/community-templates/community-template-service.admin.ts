import { db } from '@shared/db';
import {
  assistantTable,
  characterTable,
  CommunityTemplateRequestEventTable,
  CommunityTemplateRequestSelectModel,
  CommunityTemplateRequestTable,
  learningScenarioTable,
  templateRequestCreatorRoleSchema,
} from '@shared/db/schema';
import { EntityType } from '@shared/entities/entity-types';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

export type CommunityTemplateRequestSummary = CommunityTemplateRequestSelectModel & {
  entityName: string;
  entityType: EntityType;
  latestEventCreatedAt: Date;
  latestEventCreatedByRole: z.infer<typeof templateRequestCreatorRoleSchema>;
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
