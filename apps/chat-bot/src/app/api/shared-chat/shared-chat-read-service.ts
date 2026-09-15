import { dbGetFilesInIds } from '@shared/db/functions/files';
import { ForbiddenError } from '@shared/error';
import { getReadOnlySignedUrl } from '@shared/s3';
import { isImageFile } from '@/utils/files/generic';
import { getImageContentType } from '@/utils/files/image-data';
import { verify } from '.';
import { getSharedChatEntity } from './shared-chat-get-entity';

/**
 * Resolves read-only signed URLs for a batch of previously uploaded shared chat
 * image attachments in a single call, doing the entity/file lookups once instead
 * of once per file (avoids an N+1 burst when restoring a long chat history).
 * Files that are missing, not images, or fail ownership verification are
 * silently omitted from the result instead of failing the whole batch.
 */
export async function getSharedChatReadOnlySignedUrls({
  inviteCode,
  entityType,
  entityId,
  fileIds,
  sharedSessionId,
}: {
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  fileIds: string[];
  sharedSessionId: string;
}): Promise<Record<string, string>> {
  if (sharedSessionId.trim() === '') {
    throw new ForbiddenError('Not authorized to access this file');
  }

  if (fileIds.length === 0) {
    return {};
  }

  const entity = await getSharedChatEntity({
    inviteCode,
    entityType,
    entityId,
  });

  verify.sharedChatEntityIsAccessible(entity);

  const files = await dbGetFilesInIds(fileIds);

  const urls: Record<string, string> = {};

  for (const file of files) {
    if (!isImageFile(file.name)) continue;

    try {
      verify.filesDoNotBelongToAnyUser([file]);
      verify.sharedChatFileOwnershipBySession({
        files: [file],
        inviteCode,
        entityType,
        entityId,
        sharedSessionId,
      });
    } catch {
      continue;
    }

    // attachment: false so the browser renders the image inline instead of downloading it.
    // The stored object's Content-Type is the raw file extension (see uploadMessageAttachment),
    // so override it with a proper image MIME type here.
    urls[file.id] = await getReadOnlySignedUrl({
      key: `message_attachments/${file.id}`,
      attachment: false,
      contentType: getImageContentType(file.type),
    });
  }

  return urls;
}
