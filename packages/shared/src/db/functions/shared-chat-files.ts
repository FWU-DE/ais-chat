import { and, inArray, lt } from 'drizzle-orm';

import { db } from '..';
import { fileTable, sharedCharacter, sharedLearningScenarioTable } from '../schema';
import { isSharedChatFileCondition } from './files';

export async function dbGetSharedChatFileCandidates() {
  return db
    .select({ id: fileTable.id, metadata: fileTable.metadata })
    .from(fileTable)
    .where(isSharedChatFileCondition);
}

export async function dbGetExpiredCharacterShares(inviteCodes: string[], cutoffDate: Date) {
  if (inviteCodes.length === 0) return [];

  return db
    .select({
      inviteCode: sharedCharacter.inviteCode,
      entityId: sharedCharacter.characterId,
    })
    .from(sharedCharacter)
    .where(
      and(
        inArray(sharedCharacter.inviteCode, inviteCodes),
        lt(sharedCharacter.expiredAt, cutoffDate),
      ),
    );
}

export async function dbGetExpiredLearningScenarioShares(inviteCodes: string[], cutoffDate: Date) {
  if (inviteCodes.length === 0) return [];

  return db
    .select({
      inviteCode: sharedLearningScenarioTable.inviteCode,
      entityId: sharedLearningScenarioTable.learningScenarioId,
    })
    .from(sharedLearningScenarioTable)
    .where(
      and(
        inArray(sharedLearningScenarioTable.inviteCode, inviteCodes),
        lt(sharedLearningScenarioTable.expiredAt, cutoffDate),
      ),
    );
}

export async function dbDeleteFilesByIds(ids: string[]) {
  // chunks are deleted via delete cascade on files table
  return db.delete(fileTable).where(inArray(fileTable.id, ids));
}
