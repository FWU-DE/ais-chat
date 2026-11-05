import {
  dbDeleteFilesByIds,
  dbGetCharacterSharesByInviteCodes,
  dbGetLearningScenarioSharesByInviteCodes,
  dbGetSharedChatFileCandidates,
} from '@shared/db/functions/shared-chat-files';
import { deleteMessageAttachments } from '@shared/files/fileService';
import { isSharedChatFileMetadata, SharedChatFileMetadata } from '@shared/shared-chat';
import {
  calculateShareSessionState,
  ShareSessionState,
} from '@shared/sharing/calculate-share-session-state';
import { CLEANUP_SAFETY_BUFFER_MS } from '@shared/sharing/const';

type SharedFileCandidate = {
  id: string;
  metadata: Pick<SharedChatFileMetadata, 'inviteCode' | 'entityType' | 'entityId'>;
};

/**
 * Cleans up files uploaded in shared chats whose linked share has been resolved (expired past
 * its extension window, manually stopped, or deleted along with its entity, e.g. cascade-deleted
 * on entity removal) for at least `CLEANUP_SAFETY_BUFFER_MS`, reusing the same share-state logic
 * the UI uses (`calculateShareSessionState`) evaluated as of that many milliseconds ago.
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

  const referenceDate = new Date(Date.now() - CLEANUP_SAFETY_BUFFER_MS);

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

  const activeCharacterKeys = getActiveShareKeys(characterShares, referenceDate);
  const activeLearningScenarioKeys = getActiveShareKeys(learningScenarioShares, referenceDate);

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

// Shares whose state (evaluated as of `referenceDate`, i.e. `CLEANUP_SAFETY_BUFFER_MS` in the
// past) is still RUNNING or EXPIRED_RECENTLY are considered active; a STOPPED or
// EXPIRED_PERMANENTLY state (or a missing share, which calculateShareSessionState also treats as
// EXPIRED_PERMANENTLY) means the share has been resolved for at least the safety buffer and its
// files become eligible for cleanup.
//
// calculateShareSessionState treats any manuallyStoppedAt as an immediate, un-bufferred STOPPED
// state, so a manual stop is only passed through once it is itself older than referenceDate;
// otherwise the share falls back to its expiredAt, keeping a just-stopped share's files around
// for the same safety buffer as a naturally expiring one.
function getActiveShareKeys(
  shares: {
    inviteCode: string;
    entityId: string;
    expiredAt: Date;
    manuallyStoppedAt: Date | null;
  }[],
  referenceDate: Date,
) {
  return new Set(
    shares
      .filter((share) => {
        const stoppedBeforeReference =
          share.manuallyStoppedAt !== null && share.manuallyStoppedAt <= referenceDate;
        const { shareSessionState } = calculateShareSessionState(
          {
            expiredAt: share.expiredAt,
            manuallyStoppedAt: stoppedBeforeReference ? share.manuallyStoppedAt : null,
          },
          referenceDate,
        );
        return (
          shareSessionState === ShareSessionState.RUNNING ||
          shareSessionState === ShareSessionState.EXPIRED_RECENTLY
        );
      })
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
