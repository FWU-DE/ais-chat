import {
  dbDeleteFilesByIds,
  dbGetExpiredCharacterShares,
  dbGetExpiredLearningScenarioShares,
  dbGetSharedChatFileCandidates,
} from '@shared/db/functions/shared-chat-files';
import { deleteMessageAttachments } from '@shared/files/fileService';
import { isSharedChatFileMetadata, SharedChatFileMetadata } from '@shared/shared-chat';
import { addDays } from '@shared/utils/date';

const EXPIRATION_OFFSET_IN_DAYS = -1;

type SharedFileCandidate = {
  id: string;
  metadata: Pick<SharedChatFileMetadata, 'inviteCode' | 'entityType' | 'entityId'>;
};

/**
 * Cleans up files uploaded in shared chats whose linked shared entity expired more than one day ago.
 *
 * The function removes files and chunks from database, then deletes corresponding S3 objects.
 */
export async function cleanupExpiredSharedChatFiles(): Promise<number> {
  const maybeSharedFiles = await dbGetSharedChatFileCandidates();

  const sharedFiles: SharedFileCandidate[] = maybeSharedFiles
    .map((file) => {
      if (isSharedChatFileMetadata(file.metadata)) {
        return file;
      }
      return undefined;
    })
    .filter((file): file is SharedFileCandidate => file !== undefined);

  if (sharedFiles.length === 0) {
    return 0;
  }

  const cutoffDate = addDays(new Date(), EXPIRATION_OFFSET_IN_DAYS);

  const characterInviteCodes = [
    ...new Set(
      sharedFiles
        .filter((file) => file.metadata.entityType === 'character')
        .map((file) => file.metadata.inviteCode),
    ),
  ];

  const learningScenarioInviteCodes = [
    ...new Set(
      sharedFiles
        .filter((file) => file.metadata.entityType === 'learningScenario')
        .map((file) => file.metadata.inviteCode),
    ),
  ];

  const [expiredCharacterShares, expiredLearningScenarioShares] = await Promise.all([
    dbGetExpiredCharacterShares(characterInviteCodes, cutoffDate),
    dbGetExpiredLearningScenarioShares(learningScenarioInviteCodes, cutoffDate),
  ]);

  const expiredCharacterKeys = new Set(
    expiredCharacterShares.map((share) => `${share.inviteCode}:${share.entityId}`),
  );
  const expiredLearningScenarioKeys = new Set(
    expiredLearningScenarioShares.map((share) => `${share.inviteCode}:${share.entityId}`),
  );

  const fileIdsToDelete = getExpiredSharedChatFileIds(
    sharedFiles,
    expiredCharacterKeys,
    expiredLearningScenarioKeys,
  );

  if (fileIdsToDelete.length === 0) {
    return 0;
  }

  await dbDeleteFilesByIds(fileIdsToDelete);
  await deleteMessageAttachments(fileIdsToDelete);

  return fileIdsToDelete.length;
}

function getExpiredSharedChatFileIds(
  sharedFiles: SharedFileCandidate[],
  expiredCharacterKeys: Set<string>,
  expiredLearningScenarioKeys: Set<string>,
) {
  return sharedFiles
    .filter((file) => {
      const key = `${file.metadata.inviteCode}:${file.metadata.entityId}`;

      if (file.metadata.entityType === 'character') {
        return expiredCharacterKeys.has(key);
      }

      return expiredLearningScenarioKeys.has(key);
    })
    .map((file) => file.id);
}
