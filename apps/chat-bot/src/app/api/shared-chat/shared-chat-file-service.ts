import { dbGetFilesInIds } from '@shared/db/functions/files';
import { dbGetSharedChatFileConversationIds } from '@shared/db/functions/shared-chat-conversation';
import { FileModel } from '@shared/db/schema';
import { ForbiddenError } from '@shared/error';
import { SharedSessionId, verify } from '@shared/shared-chat';

type SharedRelatedFile = FileModel & { conversationMessageId?: string };

/**
 * Combines entity-related files with files uploaded for the current shared chat turn.
 * Uploaded files are associated with the most recent user message so downstream
 * image attachment enrichment can attach them to the right message.
 */
export async function combineSharedRelatedFiles({
  relatedFileEntities,
  fileIds,
  sharedSessionId,
  userMessageId,
}: {
  relatedFileEntities: FileModel[];
  fileIds?: string[];
  sharedSessionId?: SharedSessionId;
  userMessageId?: string;
}): Promise<SharedRelatedFile[]> {
  if (fileIds === undefined || fileIds.length === 0) {
    return relatedFileEntities;
  }

  verify.sharedSessionIdIsNotEmpty(sharedSessionId);

  const uploadedFiles = await dbGetFilesInIds(fileIds);
  verify.filesDoNotBelongToAnyUser(uploadedFiles);
  const mappedToThisConversation = new Set(
    (await dbGetSharedChatFileConversationIds(fileIds))
      .filter((mapping) => mapping.conversationId === sharedSessionId)
      .map((mapping) => mapping.fileId),
  );
  if (uploadedFiles.some((file) => !mappedToThisConversation.has(file.id))) {
    throw new ForbiddenError('Not authorized to access this file');
  }

  const uploadedFilesWithMessageId: SharedRelatedFile[] = uploadedFiles.map((file) => ({
    ...file,
    conversationMessageId: userMessageId,
  }));

  return [...relatedFileEntities, ...uploadedFilesWithMessageId];
}
