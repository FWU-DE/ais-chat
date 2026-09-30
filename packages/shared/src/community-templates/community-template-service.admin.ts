import {
  dbConditionalTransitionState,
  dbGetCommunityTemplateRequestRows,
  dbGetCommunityTemplateRequestWithEventsRows,
  dbGetRequestById,
  dbInsertTemplateRequestEvent,
  dbUpdateInternalNote,
} from '@shared/community-templates/community-template-db.admin';
import { dbSetEntityCommunityShared } from '@shared/community-templates/db-functions';
import { db } from '@shared/db';
import {
  CommunityTemplateRequestEventSelectModel,
  CommunityTemplateRequestSelectModel,
  templateRequestCreatorRoleSchema,
  TemplateRequestStatus,
} from '@shared/db/schema';
import { EntityRef, EntityType } from '@shared/entities/entity-types';
import { InvalidArgumentError, NotFoundError } from '@shared/error';
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

type EntityNameColumns = {
  assistantName: string | null;
  characterName: string | null;
  learningScenarioName: string | null;
};

/**
 * Resolves which entity a request targets. Exactly one id column is populated per request
 * (enforced by a db check constraint).
 */
export function resolveEntityReference(
  request: Pick<
    CommunityTemplateRequestSelectModel,
    'assistantId' | 'characterId' | 'learningScenarioId'
  >,
): EntityRef {
  if (request.characterId !== null) {
    return { entityType: 'character', entityId: request.characterId };
  }
  if (request.assistantId !== null) {
    return { entityType: 'assistant', entityId: request.assistantId };
  }
  if (request.learningScenarioId !== null) {
    return { entityType: 'learningScenario', entityId: request.learningScenarioId };
  }
  throw new InvalidArgumentError('Community template request has no associated entity');
}

/**
 * Resolves the request's entity type and display name from the (exactly one populated) joined
 * name columns.
 */
export function resolveEntityNameAndType(
  request: Pick<
    CommunityTemplateRequestSelectModel,
    'assistantId' | 'characterId' | 'learningScenarioId'
  >,
  names: EntityNameColumns,
): { entityType: EntityType; entityName: string } {
  const { entityType } = resolveEntityReference(request);
  const entityName = names.assistantName ?? names.characterName ?? names.learningScenarioName;
  if (entityName === null) {
    throw new InvalidArgumentError('Associated entity not found for community template request');
  }
  return { entityType, entityName };
}

/** States from which a request may be approved. */
export function getApprovableStates(): TemplateRequestStatus[] {
  return ['submitted', 'rejected'];
}

/** States from which a request may be rejected. */
export function getRejectableStates(): TemplateRequestStatus[] {
  return ['submitted'];
}

export function mapRequestRowsToSummaries(
  rows: Array<
    EntityNameColumns & {
      request: CommunityTemplateRequestSelectModel;
      latestEventCreatedAt: Date;
      latestEventCreatedByRole: z.infer<typeof templateRequestCreatorRoleSchema>;
    }
  >,
): CommunityTemplateRequestSummary[] {
  return rows.map((row) => ({
    ...row.request,
    ...resolveEntityNameAndType(row.request, row),
    latestEventCreatedAt: row.latestEventCreatedAt,
    latestEventCreatedByRole: row.latestEventCreatedByRole,
  }));
}

export function mapRequestRowsToDetailAdmin(
  rows: Array<
    EntityNameColumns & {
      request: CommunityTemplateRequestSelectModel;
      event: CommunityTemplateRequestEventSelectModel;
    }
  >,
): CommunityTemplateRequestWithEventsAdmin {
  const firstRow = rows[0];
  if (!firstRow) throw new NotFoundError('Community template request not found');

  return {
    ...firstRow.request,
    ...resolveEntityNameAndType(firstRow.request, firstRow),
    events: rows.map(({ event }) => event),
  };
}

/**
 * Returns all community template requests for the list view in admin app.
 * Each record includes the entity id, name and type as well as the latest event information.
 */
export async function getCommunityTemplateRequests(): Promise<CommunityTemplateRequestSummary[]> {
  const rows = await dbGetCommunityTemplateRequestRows();
  return mapRequestRowsToSummaries(rows);
}

/**
 * Returns the community template request along with all its events for the admin view.
 * Also includes the entity id, name and type.
 */
export async function getCommunityTemplateRequestWithEventsForAdmin(
  requestId: string,
): Promise<CommunityTemplateRequestWithEventsAdmin> {
  const rows = await dbGetCommunityTemplateRequestWithEventsRows(requestId);
  return mapRequestRowsToDetailAdmin(rows);
}

/**
 * Editor users can update the internal note on a request.
 */
export async function updateInternalNote(requestId: string, note: string): Promise<void> {
  await dbUpdateInternalNote(requestId, note);
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
    // Conditional update: only the transaction whose WHERE clause still matches wins the race,
    // preventing two concurrent approvals from both inserting an approve event.
    const request = await dbConditionalTransitionState(
      requestId,
      'approved',
      getApprovableStates(),
      tx,
    );

    if (!request) {
      const existing = await dbGetRequestById(requestId, tx);
      if (!existing) throw new NotFoundError('Community template request not found');
      throw new InvalidArgumentError('Transition to approved state is not possible.');
    }

    await dbInsertTemplateRequestEvent(
      {
        templateRequestId: requestId,
        eventType: 'approve',
        createdByRole: 'editor',
        createdById: editorId,
        createdByName: editorName,
        message: 'Request approved',
      },
      tx,
    );

    await dbSetEntityCommunityShared(resolveEntityReference(request), true, tx);
  });
}

export async function rejectRequest(
  requestId: string,
  editorId: string,
  editorName: string,
  message: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Conditional update: only the transaction whose WHERE clause still matches wins the race,
    // preventing two concurrent actions from both inserting a reject event.
    const request = await dbConditionalTransitionState(
      requestId,
      'rejected',
      getRejectableStates(),
      tx,
    );

    if (!request) {
      const existing = await dbGetRequestById(requestId, tx);
      if (!existing) throw new NotFoundError('Community template request not found');
      throw new InvalidArgumentError('Transition to rejected state is not possible.');
    }

    await dbInsertTemplateRequestEvent(
      {
        templateRequestId: requestId,
        eventType: 'reject',
        createdByRole: 'editor',
        createdById: editorId,
        createdByName: editorName,
        message: message,
      },
      tx,
    );
  });
}

export async function sendMessageToAuthor(
  requestId: string,
  editorId: string,
  editorName: string,
  message: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await dbInsertTemplateRequestEvent(
      {
        templateRequestId: requestId,
        eventType: 'editor_message',
        createdByRole: 'editor',
        createdById: editorId,
        createdByName: editorName,
        message: message,
      },
      tx,
    );
  });
}
