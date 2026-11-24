import { ForbiddenError } from '@shared/error';

import { SharedSessionId } from './shared-chat-types';

export function sharedSessionIdIsNotEmpty(
  sharedSessionId: SharedSessionId | undefined,
): asserts sharedSessionId is SharedSessionId {
  if (sharedSessionId === undefined || sharedSessionId.trim() === '') {
    throw new ForbiddenError('Not authorized to use uploaded files');
  }
}

export function filesDoNotBelongToAnyUser(files: { userId: string | null }[]): void {
  const unauthorizedFiles = files.filter((file) => file.userId !== null);
  if (unauthorizedFiles.length > 0) {
    throw new ForbiddenError('Not authorized to use one or more files');
  }
}

export function sharedChatIsNotExpired(sharedEntity: { expiredAt: Date }): void {
  if (sharedEntity.expiredAt < new Date()) {
    throw new ForbiddenError('Shared chat has expired');
  }
}

export function sharedChatIsNotDeleted(sharedEntity: { isDeleted: boolean }): void {
  if (sharedEntity.isDeleted) {
    throw new ForbiddenError('Shared chat has been deleted');
  }
}

export function sharedChatIsNotSuspended(sharedEntity: { suspended: boolean }): void {
  if (sharedEntity.suspended) {
    throw new ForbiddenError('Shared chat has been suspended');
  }
}

export function sharedChatIsNotManuallyStopped(sharedEntity: {
  manuallyStoppedAt: Date | null;
}): void {
  if (sharedEntity.manuallyStoppedAt !== null) {
    throw new ForbiddenError('Shared chat has been manually stopped');
  }
}

export function sharedChatEntityIsAccessible(sharedEntity: {
  expiredAt: Date;
  isDeleted: boolean;
  suspended: boolean;
  manuallyStoppedAt: Date | null;
}): void {
  sharedChatIsNotExpired(sharedEntity);
  sharedChatIsNotDeleted(sharedEntity);
  sharedChatIsNotSuspended(sharedEntity);
  sharedChatIsNotManuallyStopped(sharedEntity);
}
