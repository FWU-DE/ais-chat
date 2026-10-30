import { dbGetFilesInIds } from '@shared/db/functions/files';
import { ForbiddenError, NotFoundError } from '@shared/error';
import { verify } from '@shared/shared-chat';
import { getSharedChatEntity } from './shared-chat-get-entity';

export async function verifySharedChatImageAccess({
  inviteCode,
  entityType,
  entityId,
  fileId,
  sharedSessionId,
  allowEnded = false,
}: {
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  fileId: string;
  sharedSessionId: string;
  allowEnded?: boolean;
}): Promise<void> {
  if (sharedSessionId.trim() === '') {
    throw new ForbiddenError('Not authorized to access this file');
  }

  const entity = await getSharedChatEntity({
    inviteCode,
    entityType,
    entityId,
  });

  if (allowEnded) {
    // User should still be able to access files even if the chat has ended, as long as it is not deleted or suspended
    verify.sharedChatIsNotDeleted(entity);
    verify.sharedChatIsNotSuspended(entity);
  } else {
    verify.sharedChatEntityIsAccessible(entity);
  }

  const files = await dbGetFilesInIds([fileId]);
  const file = files[0];

  if (file === undefined) {
    throw new NotFoundError('File not found');
  }

  verify.filesDoNotBelongToAnyUser([file]);
  verify.sharedChatFileOwnershipBySession({
    files: [file],
    inviteCode,
    entityType,
    entityId,
    sharedSessionId,
  });
}
