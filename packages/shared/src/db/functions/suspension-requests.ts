import {
  assertEntityType,
  EntityRef,
  EntityType,
  throwEntityInvalidArgumentError,
} from '@shared/entities/entity-types';
import { NotFoundError } from '@shared/error';
import { desc, eq, getTableColumns, sql } from 'drizzle-orm';

import { db } from '..';
import {
  assistantTable,
  characterTable,
  learningScenarioTable,
  SuspensionRequestSelectModel,
  suspensionRequestTable,
} from '../schema';

type SuspensionRequestWithEntityDetails = SuspensionRequestSelectModel & {
  entityType: EntityType;
  entityId: string;
  entityName: string | null;
  suspended: boolean | null;
};

function getSuspensionRequestEntityIdColumn(entityType: EntityType) {
  assertEntityType(entityType);

  switch (entityType) {
    case 'assistant':
      return suspensionRequestTable.assistantId;
    case 'character':
      return suspensionRequestTable.characterId;
    case 'learningScenario':
      return suspensionRequestTable.learningScenarioId;
    default:
      throwEntityInvalidArgumentError();
  }
}

function baseSuspensionRequestsWithEntityDetailsQuery() {
  return db
    .select({
      ...getTableColumns(suspensionRequestTable),
      entityType: sql<EntityType>`
        CASE
          WHEN ${suspensionRequestTable.assistantId} IS NOT NULL THEN 'assistant'
          WHEN ${suspensionRequestTable.characterId} IS NOT NULL THEN 'character'
          ELSE 'learningScenario'
        END
      `,
      entityId: sql<string>`
        COALESCE(
          ${suspensionRequestTable.assistantId},
          ${suspensionRequestTable.characterId},
          ${suspensionRequestTable.learningScenarioId}
        )
      `,
      entityName: sql<string | null>`
        CASE
          WHEN ${suspensionRequestTable.assistantId} IS NOT NULL THEN ${assistantTable.name}
          WHEN ${suspensionRequestTable.characterId} IS NOT NULL THEN ${characterTable.name}
          ELSE ${learningScenarioTable.name}
        END
      `,
      suspended: sql<boolean | null>`
        CASE
          WHEN ${suspensionRequestTable.assistantId} IS NOT NULL THEN ${assistantTable.suspended}
          WHEN ${suspensionRequestTable.characterId} IS NOT NULL THEN ${characterTable.suspended}
          ELSE ${learningScenarioTable.suspended}
        END
      `,
    })
    .from(suspensionRequestTable)
    .leftJoin(assistantTable, eq(suspensionRequestTable.assistantId, assistantTable.id))
    .leftJoin(characterTable, eq(suspensionRequestTable.characterId, characterTable.id))
    .leftJoin(
      learningScenarioTable,
      eq(suspensionRequestTable.learningScenarioId, learningScenarioTable.id),
    );
}

export async function dbCreateSuspensionRequest({
  suspensionRequest,
}: {
  suspensionRequest: typeof suspensionRequestTable.$inferInsert;
}): Promise<SuspensionRequestSelectModel> {
  const [createdSuspensionRequest] = await db
    .insert(suspensionRequestTable)
    .values(suspensionRequest)
    .returning();

  if (!createdSuspensionRequest) {
    throw new Error('Could not create suspension request');
  }

  return createdSuspensionRequest;
}

export async function dbMarkSuspensionRequestAsChecked({
  suspensionRequestId,
}: {
  suspensionRequestId: string;
}): Promise<SuspensionRequestSelectModel> {
  const [updatedSuspensionRequest] = await db
    .update(suspensionRequestTable)
    .set({ checked: true })
    .where(eq(suspensionRequestTable.id, suspensionRequestId))
    .returning();

  if (!updatedSuspensionRequest) {
    throw new NotFoundError('Suspension request not found');
  }

  return updatedSuspensionRequest;
}

export async function dbGetAllSuspensionRequestsWithEntityDetails(): Promise<
  SuspensionRequestWithEntityDetails[]
> {
  return baseSuspensionRequestsWithEntityDetailsQuery().orderBy(
    desc(suspensionRequestTable.createdAt),
  );
}

export async function dbGetSuspensionRequestsByEntityRef({
  entityType,
  entityId,
}: EntityRef): Promise<SuspensionRequestSelectModel[]> {
  const entityColumn = getSuspensionRequestEntityIdColumn(entityType);

  return db
    .select()
    .from(suspensionRequestTable)
    .where(eq(entityColumn, entityId))
    .orderBy(desc(suspensionRequestTable.createdAt));
}

export async function dbGetSuspensionRequestsByEntityRefWithEntityDetails({
  entityType,
  entityId,
}: EntityRef): Promise<SuspensionRequestWithEntityDetails[]> {
  const entityColumn = getSuspensionRequestEntityIdColumn(entityType);

  return baseSuspensionRequestsWithEntityDetailsQuery()
    .where(eq(entityColumn, entityId))
    .orderBy(desc(suspensionRequestTable.createdAt));
}
