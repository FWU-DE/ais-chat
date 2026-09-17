import { dbGetFilesInIds } from '@shared/db/functions/files';
import { ForbiddenError, NotFoundError } from '@shared/error';
import { verify } from '.';
import { getSharedChatEntity } from './shared-chat-get-entity';

export async function verifySharedChatImageAccess({
  inviteCode,
  entityType,
  entityId,
  fileId,
  sharedSessionId,
}: {
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  fileId: string;
  sharedSessionId: string;
}): Promise<void> {
  if (sharedSessionId.trim() === '') {
    throw new ForbiddenError('Not authorized to access this file');
  }

  const entity = await getSharedChatEntity({
    inviteCode,
    entityType,
    entityId,
  });

  verify.sharedChatEntityIsAccessible(entity);

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
