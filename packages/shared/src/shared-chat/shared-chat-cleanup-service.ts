import {
  dbDeleteFilesByIds,
  dbGetCharacterSharesByInviteCodes,
  dbGetLearningScenarioSharesByInviteCodes,
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
 * Cleans up files uploaded in shared chats whose linked shared entity expired more than one day
 * ago, or whose share was deleted along with its entity (e.g. cascade-deleted on entity removal).
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

  const [characterShares, learningScenarioShares] = await Promise.all([
    dbGetCharacterSharesByInviteCodes(characterInviteCodes),
    dbGetLearningScenarioSharesByInviteCodes(learningScenarioInviteCodes),
  ]);

  const activeCharacterKeys = getActiveShareKeys(characterShares, cutoffDate);
  const activeLearningScenarioKeys = getActiveShareKeys(learningScenarioShares, cutoffDate);

  const fileIdsToDelete = getExpiredSharedChatFileIds(
    sharedFiles,
    activeCharacterKeys,
    activeLearningScenarioKeys,
  );

  if (fileIdsToDelete.length === 0) {
    return 0;
  }

  await dbDeleteFilesByIds(fileIdsToDelete);
  await deleteMessageAttachments(fileIdsToDelete);

  return fileIdsToDelete.length;
}

// Shares that still exist and are not yet expired; anything else (expired, or cascade-deleted
// along with its entity) is treated as resolved and its files become eligible for cleanup.
function getActiveShareKeys(
  shares: { inviteCode: string; entityId: string; expiredAt: Date }[],
  cutoffDate: Date,
) {
  return new Set(
    shares
      .filter((share) => share.expiredAt >= cutoffDate)
      .map((share) => `${share.inviteCode}:${share.entityId}`),
  );
}

function getExpiredSharedChatFileIds(
  sharedFiles: SharedFileCandidate[],
  activeCharacterKeys: Set<string>,
  activeLearningScenarioKeys: Set<string>,
) {
  return sharedFiles
    .filter((file) => {
      const key = `${file.metadata.inviteCode}:${file.metadata.entityId}`;

      if (file.metadata.entityType === 'character') {
        return !activeCharacterKeys.has(key);
      }

      return !activeLearningScenarioKeys.has(key);
    })
    .map((file) => file.id);
}
