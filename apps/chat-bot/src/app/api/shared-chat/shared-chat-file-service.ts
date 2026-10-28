import { dbGetFilesInIds } from '@shared/db/functions/files';
import { FileModel } from '@shared/db/schema';
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
  inviteCode,
  entityType,
  entityId,
  sharedSessionId,
  userMessageId,
}: {
  relatedFileEntities: FileModel[];
  fileIds?: string[];
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId?: SharedSessionId;
  userMessageId?: string;
}): Promise<SharedRelatedFile[]> {
  if (fileIds === undefined || fileIds.length === 0) {
    return relatedFileEntities;
  }

  verify.sharedSessionIdIsNotEmpty(sharedSessionId);

  const uploadedFiles = await dbGetFilesInIds(fileIds);
  verify.filesDoNotBelongToAnyUser(uploadedFiles);
  verify.sharedChatFileOwnershipBySession({
    files: uploadedFiles,
    inviteCode,
    entityType,
    entityId,
    sharedSessionId,
  });

  const uploadedFilesWithMessageId: SharedRelatedFile[] = uploadedFiles.map((file) => ({
    ...file,
    conversationMessageId: userMessageId,
  }));

  return [...relatedFileEntities, ...uploadedFilesWithMessageId];
}
