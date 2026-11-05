import { and, inArray, isNotNull, isNull } from 'drizzle-orm';

import { db } from '..';
import { fileTable, sharedCharacter, sharedLearningScenarioTable } from '../schema';

export async function dbGetSharedChatFileCandidates() {
  return db
    .select({ id: fileTable.id, metadata: fileTable.metadata })
    .from(fileTable)
    .where(and(isNull(fileTable.userId), isNotNull(fileTable.metadata)));
}

export async function dbGetCharacterSharesByInviteCodes(inviteCodes: string[]) {
  if (inviteCodes.length === 0) return [];

  return db
    .select({
      inviteCode: sharedCharacter.inviteCode,
      entityId: sharedCharacter.characterId,
      expiredAt: sharedCharacter.expiredAt,
      manuallyStoppedAt: sharedCharacter.manuallyStoppedAt,
    })
    .from(sharedCharacter)
    .where(inArray(sharedCharacter.inviteCode, inviteCodes));
}

export async function dbGetLearningScenarioSharesByInviteCodes(inviteCodes: string[]) {
  if (inviteCodes.length === 0) return [];

  return db
    .select({
      inviteCode: sharedLearningScenarioTable.inviteCode,
      entityId: sharedLearningScenarioTable.learningScenarioId,
      expiredAt: sharedLearningScenarioTable.expiredAt,
      manuallyStoppedAt: sharedLearningScenarioTable.manuallyStoppedAt,
    })
    .from(sharedLearningScenarioTable)
    .where(inArray(sharedLearningScenarioTable.inviteCode, inviteCodes));
}

export async function dbDeleteFilesByIds(ids: string[]) {
  // chunks are deleted via delete cascade on files table
  return db.delete(fileTable).where(inArray(fileTable.id, ids));
}
