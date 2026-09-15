import { ForbiddenError } from '@shared/error';
import { SharedChatFileMetadata, SharedSessionId } from '.';
import { FileMetadata } from '@shared/db/schema';
import { isSharedChatFileMetadata } from './shared-chat-types';

function isSharedChatFileOwnedBySession({
  fileMetadata,
  inviteCode,
  entityType,
  entityId,
  sharedSessionId,
}: {
  fileMetadata: SharedChatFileMetadata;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: SharedSessionId;
}): boolean {
  return (
    fileMetadata.inviteCode === inviteCode &&
    fileMetadata.entityType === entityType &&
    fileMetadata.entityId === entityId &&
    fileMetadata.sessionId === sharedSessionId
  );
}

export function verifySharedChatFileOwnershipBySession({
  files,
  inviteCode,
  entityType,
  entityId,
  sharedSessionId,
}: {
  files: { metadata: FileMetadata | null }[];
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: SharedSessionId;
}): void {
  for (const fileMetadata of files.map((file) => file.metadata)) {
    // Fail closed: null/malformed metadata must not bypass the ownership check.
    if (
      !isSharedChatFileMetadata(fileMetadata) ||
      !isSharedChatFileOwnedBySession({
        fileMetadata,
        inviteCode,
        entityType,
        entityId,
        sharedSessionId,
      })
    ) {
      throw new ForbiddenError('Not authorized to access this file');
    }
  }
}

export function verifySharedSessionIdIsNotEmpty(
  sharedSessionId: SharedSessionId | undefined,
): asserts sharedSessionId is SharedSessionId {
  if (sharedSessionId === undefined || sharedSessionId.trim() === '') {
    throw new ForbiddenError('Not authorized to use uploaded files');
  }
}

export function verifyFilesDoNotBelongToAnyUser(files: { userId: string | null }[]): void {
  const unauthorizedFiles = files.filter((file) => file.userId !== null);
  if (unauthorizedFiles.length > 0) {
    throw new ForbiddenError('Not authorized to use one or more files');
  }
}

export function verifySharedChatIsNotExpired(sharedEntity: { expiredAt: Date }): void {
  if (sharedEntity.expiredAt < new Date()) {
    throw new ForbiddenError('Shared chat has expired');
  }
}

export function verifySharedChatIsNotDeleted(sharedEntity: { isDeleted: boolean }): void {
  if (sharedEntity.isDeleted) {
    throw new ForbiddenError('Shared chat has been deleted');
  }
}

export function verifySharedChatIsNotSuspended(sharedEntity: { suspended: boolean }): void {
  if (sharedEntity.suspended) {
    throw new ForbiddenError('Shared chat has been suspended');
  }
}

export function verifySharedChatIsNotManuallyStopped(sharedEntity: {
  manuallyStoppedAt: Date | null;
}): void {
  if (sharedEntity.manuallyStoppedAt !== null) {
    throw new ForbiddenError('Shared chat has been manually stopped');
  }
}

export function verifySharedChatEntityIsAccessible(sharedEntity: {
  expiredAt: Date;
  isDeleted: boolean;
  suspended: boolean;
  manuallyStoppedAt: Date | null;
}): void {
  verifySharedChatIsNotExpired(sharedEntity);
  verifySharedChatIsNotDeleted(sharedEntity);
  verifySharedChatIsNotSuspended(sharedEntity);
  verifySharedChatIsNotManuallyStopped(sharedEntity);
}
