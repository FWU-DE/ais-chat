import { dbGetFilesInIds } from '@shared/db/functions/files';
import { ForbiddenError, NotFoundError } from '@shared/error';
import { getReadOnlySignedUrl } from '@shared/s3';
import { verify } from '.';
import { getSharedChatEntity } from './shared-chat-get-entity';

export async function getSharedChatReadOnlySignedUrl({
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
}): Promise<string> {
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
    files,
    inviteCode,
    entityType,
    entityId,
    sharedSessionId,
  });

  // attachment: false so the browser renders the image inline instead of downloading it
  return getReadOnlySignedUrl({ key: `message_attachments/${file.id}`, attachment: false });
}
