import { dbDeleteFilesByIds } from '@shared/db/functions/files';
import { dbDeleteExpiredSharedChatConversations } from '@shared/db/functions/shared-chat-conversation';
import { deleteMessageAttachments } from '@shared/files/fileService';
import { addDays } from '@shared/utils/date';

const EXPIRATION_OFFSET_IN_DAYS = -1;

/**
 * Deletes shared chat conversations whose share expired more than one day ago, together with
 * the files attached to them (database rows, chunks and S3 objects).
 *
 * @returns The number of deleted files.
 */
export async function cleanupExpiredSharedChatFiles(): Promise<number> {
  const cutoffDate = addDays(new Date(), EXPIRATION_OFFSET_IN_DAYS);
  const { fileIds } = await dbDeleteExpiredSharedChatConversations(cutoffDate);

  if (fileIds.length === 0) {
    return 0;
  }

  await dbDeleteFilesByIds(fileIds);
  await deleteMessageAttachments(fileIds);

  return fileIds.length;
}
