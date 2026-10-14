import { eq } from 'drizzle-orm';
import { db } from '@shared/db';
import {
  AssistantFileMapping,
  CharacterFileMapping,
  chunkTable,
  fileTable,
  LearningScenarioFileMapping,
} from '@shared/db/schema';
import {
  copyFileInS3,
  deleteFileFromS3,
  deleteFilesFromS3,
  getReadOnlySignedUrl,
  uploadFileToS3,
} from '@shared/s3';
import { cnanoid } from '../random/randomService';
import { logError } from '@shared/logging';

const MESSAGE_ATTACHMENTS_FOLDER_NAME = 'message_attachments';

/**
 * Duplicates a file and all its related text chunks and embeddings.
 * This preserves all existing processing (embeddings, chunks, metadata) while creating
 * a clean copy with a new file ID.
 *
 * @param originalFileId - The ID of the original file to duplicate
 * @param userId - The owner of the duplicated file
 * @returns Promise with the new file ID
 */
export async function duplicateFileWithEmbeddings(
  originalFileId: string,
  userId: string,
): Promise<string> {
  const newFileId = `file_${cnanoid()}`;

  try {
    // Get original file record
    const [originalFile] = await db
      .select()
      .from(fileTable)
      .where(eq(fileTable.id, originalFileId));
    if (!originalFile) {
      throw new Error(`Original file not found: ${originalFileId}`);
    }

    // Get all text chunks for the original file
    const originalChunks = await db
      .select()
      .from(chunkTable)
      .where(eq(chunkTable.fileId, originalFileId));

    // Copy the original file from S3
    await copyFileInS3({
      copySource: `message_attachments/${originalFileId}`,
      newKey: `message_attachments/${newFileId}`,
    });

    // Create database records in a transaction
    await db.transaction(async (tx) => {
      // Create new file record with new ID
      await tx.insert(fileTable).values({
        ...originalFile,
        id: newFileId,
        userId,
      });

      // Copy all chunks with new file ID (remove id to let DB generate new ones)
      if (originalChunks.length > 0) {
        const newChunks = originalChunks.map((chunk) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, ...rest } = chunk;
          return {
            ...rest,
            fileId: newFileId,
          };
        });
        await tx.insert(chunkTable).values(newChunks);
      }
    });

    return newFileId;
  } catch (error) {
    logError(`Error copying file from ${originalFileId}`, error);
    throw new Error(
      `Failed to copy file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error },
    );
  }
}

/**
 * Links a file to a character by creating a mapping record.
 *
 * @param fileId - The ID of the file to link
 * @param characterId - The ID of the character to link to
 */
export async function linkFileToCharacter(fileId: string, characterId: string): Promise<void> {
  await db.insert(CharacterFileMapping).values({
    fileId,
    characterId,
  });
}

/**
 * Links a file to an assistant by creating a mapping record.
 *
 * @param fileId - The ID of the file to link
 * @param assistantId - The ID of the assistant to link to
 */
export async function linkFileToAssistant(fileId: string, assistantId: string): Promise<void> {
  await db.insert(AssistantFileMapping).values({
    fileId,
    assistantId,
  });
}

/**
 * Links a file to a learning scenario by creating a mapping record.
 *
 * @param fileId - The ID of the file to link
 * @param learningScenarioId - The ID of the learning scenario to link to
 */
export async function linkFileToLearningScenario(
  fileId: string,
  learningScenarioId: string,
): Promise<void> {
  await db.insert(LearningScenarioFileMapping).values({
    fileId,
    learningScenarioId,
  });
}

/**
 * Uploads a new file to the message attachments path in S3.
 */
export async function uploadMessageAttachment({
  fileId,
  fileExtension,
  buffer,
}: {
  fileId: string;
  fileExtension: string;
  buffer: Buffer;
}) {
  const bufferToUpload = buffer;

  await uploadFileToS3({
    key: `${MESSAGE_ATTACHMENTS_FOLDER_NAME}/${fileId}`,
    body: bufferToUpload,
    contentType: fileExtension,
  });
}

/**
 * Deletes a bunch of files in the message attachments path in S3.
 * CAUTION: This function does not check any permissions.
 */
export async function deleteMessageAttachments(fileIds: string[]): Promise<void> {
  await deleteFilesFromS3(fileIds.map((fileId) => `${MESSAGE_ATTACHMENTS_FOLDER_NAME}/${fileId}`));
}

/**
 * Deletes an avatar picture from S3.
 *
 * @param key The pictureId for characters, assistants and learning scenarios
 * does contain the full path so we can directly use it as key.
 * Does nothing if key is null or undefined.
 *
 * If the last file of folder is deleted, the folder in s3 automatically gets deleted as well.
 */
export async function deleteAvatarPicture(key: string | null | undefined): Promise<void> {
  if (key) await deleteFileFromS3({ key });
}

export type UploadAvatarPictureParams = {
  key: string;
  croppedImageBlob: Blob;
};

export async function uploadAvatarPicture({ key, croppedImageBlob }: UploadAvatarPictureParams) {
  await uploadFileToS3({
    key: key,
    body: croppedImageBlob,
    contentType: croppedImageBlob.type,
  });
}

/**
 * Gets a signed URL for read-only access to an avatar picture in S3.
 * If the object does not exist in S3, a signed URL is still created but will return 404.
 *
 * @param key
 * @returns undefined if key is falsy.
 */
export async function getAvatarPictureUrl(key: string | null | undefined) {
  if (!key) return undefined;
  try {
    return await getReadOnlySignedUrl({ key });
  } catch (error) {
    logError('Error getting signed URL for avatar picture:', error);
    return undefined;
  }
}

export async function copyAvatarPicture(originalKey: string, newKey: string): Promise<void> {
  await copyFileInS3({
    copySource: originalKey,
    newKey: newKey,
  });
}
