import { desc, eq } from 'drizzle-orm';
import { UserModel } from '@shared/auth/user-model';
import { verifySuspensionState, verifyWriteAccess } from '@shared/auth/authorization-service';
import { db } from '@shared/db';
import {
  CommunityTemplateRequestEventSelectModel,
  CommunityTemplateRequestSelectModel,
  CommunityTemplateRequestTable,
  templateRequestStatusSchema,
} from '@shared/db/schema';
import { checkParameterUUID, NotFoundError } from '@shared/error';
import { getCharacterInfo } from '@shared/characters/character-service';
import { createCancelEvent, createSubmitEvent } from './community-template-request-event';
import {
  dbGetTemplateRequestWithEvents,
  dbInsertTemplateRequest,
  dbInsertTemplateRequestEvent,
  dbUpdateTemplateRequest,
} from './db-functions';

export type CommunityTemplateRequestWithEvents = CommunityTemplateRequestSelectModel & {
  events: CommunityTemplateRequestEventSelectModel[];
};

/**
 * Retrieves the latest community template request for a given character.
 * Returns undefined if no request exists.
 */
async function getLatestCharacterTemplateRequest(characterId: string) {
  const [request] = await db
    .select()
    .from(CommunityTemplateRequestTable)
    .where(eq(CommunityTemplateRequestTable.characterId, characterId))
    .orderBy(desc(CommunityTemplateRequestTable.createdAt), desc(CommunityTemplateRequestTable.id))
    .limit(1);

  return request;
}

async function verifyCharacterTemplateRequestAccess(
  characterId: string,
  user: Pick<UserModel, 'id'>,
) {
  checkParameterUUID(characterId);

  const { character } = await getCharacterInfo(characterId, user.id);
  verifyWriteAccess({ item: character, user });
  verifySuspensionState({ item: character });
}

async function verifyTemplateRequestOwnership({
  templateRequest,
  user,
}: {
  templateRequest: CommunityTemplateRequestSelectModel;
  user: Pick<UserModel, 'id'>;
}) {
  if (templateRequest.createdBy !== user.id) {
    throw new Error('User does not own this community template request');
  }
}

/**
 * Retrieves a community template request along with its associated events.
 */
export async function getCommunityTemplateRequestWithEvents({
  characterId,
  user,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
}): Promise<CommunityTemplateRequestWithEvents | null> {
  const requestWithEvents = await dbGetTemplateRequestWithEvents(characterId);
  if (requestWithEvents === null) return null;

  verifyTemplateRequestOwnership({ templateRequest: requestWithEvents, user });
  return requestWithEvents;
}

/**
 * Creates a new community template request or updates the existing one.
 *
 * @param param0
 * @returns
 */
export async function createCommunityTemplateRequest({
  characterId,
  user,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
}): Promise<CommunityTemplateRequestWithEvents | null> {
  await verifyCharacterTemplateRequestAccess(characterId, user);

  const latestRequest = await getLatestCharacterTemplateRequest(characterId);

  // two cases:
  // case 1: there is no existing request
  // case 2: there is an existing request

  // case 1:
  // create a new request event with event type 'submitted'
  await db.transaction(async (tx) => {
    const createdRequest = await dbInsertTemplateRequest(
      { characterId, createdBy: user.id, state: 'submitted' },
      tx,
    );
    await dbInsertTemplateRequestEvent(createSubmitEvent(createdRequest.id, user.id), tx);
  });

  // case 2:
  // update existing request and create new event with status 'submitted'
  if (latestRequest) {
    await db.transaction(async (tx) => {
      await dbUpdateTemplateRequest({ id: latestRequest.id, state: 'submitted' }, tx);
      await dbInsertTemplateRequestEvent(createSubmitEvent(latestRequest.id, user.id), tx);
    });
  }

  // return request with all events
  return dbGetTemplateRequestWithEvents(characterId);
}

/**
 * User cancels its own community request.
 * That might influence the entity's access level
 * if it has already been shared with the community or school.
 *
 * @param param0
 * @returns
 */
export async function cancelCommunityTemplateRequest({
  characterId,
  user,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
}): Promise<CommunityTemplateRequestWithEvents | null> {
  await verifyCharacterTemplateRequestAccess(characterId, user);

  const latestRequest = await getLatestCharacterTemplateRequest(characterId);
  if (!latestRequest) {
    throw new NotFoundError('No community template request found for this character');
  }
  await verifyTemplateRequestOwnership({ templateRequest: latestRequest, user });

  // two cases
  // case 1: the request is already submitted and the entity is already shared with the community.
  // --> we have to update the entities access_level to private or school or whatever
  // case 2: the request is not yet submitted and the entity is not shared with the community.
  // --> we can simply cancel the request without changing the entity's access_level.

  // Todo: case 1 missing

  // case 2
  const cancelledEvent = createCancelEvent(latestRequest.id, user.id);
  await db.transaction(async (tx) => {
    await dbInsertTemplateRequestEvent(cancelledEvent, tx);
    await dbUpdateTemplateRequest(
      {
        id: latestRequest.id,
        state: templateRequestStatusSchema.enum.cancelled,
      },
      tx,
    );
  });

  // return request with all events
  return dbGetTemplateRequestWithEvents(characterId);
}
