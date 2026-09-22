import { db } from '@shared/db';
import {
  CommunityTemplateRequestEventInsertModel,
  CommunityTemplateRequestEventTable,
  CommunityTemplateRequestInsertModel,
  CommunityTemplateRequestTable,
  CommunityTemplateRequestUpdateModel,
} from '@shared/db/schema';
import { PgTransactionObject } from '@shared/db/types';
import { eq } from 'drizzle-orm';

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
 * Returns the community template request along with its associated events,
 * or null if no request exists for the given character ID.
 */
export async function dbGetTemplateRequestWithEvents(characterId: string) {
  const requestWithEvents = await db
    .select()
    .from(CommunityTemplateRequestTable)
    .where(eq(CommunityTemplateRequestTable.characterId, characterId))
    .innerJoin(
      CommunityTemplateRequestEventTable,
      eq(CommunityTemplateRequestEventTable.templateRequestId, CommunityTemplateRequestTable.id),
    )
    .orderBy(CommunityTemplateRequestTable.createdAt);

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
