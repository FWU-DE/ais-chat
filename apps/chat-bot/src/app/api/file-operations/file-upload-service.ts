import { isSupportedImageExtension } from '@/const';
import { getFileExtension } from '@/utils/files/generic';
import { FileMetadata } from '@shared/db/schema';
import { cnanoid } from '@shared/random/randomService';
import { preprocessImage } from './preprocess-image';
import { uploadMessageAttachment } from '@shared/files/fileService';
import { dbInsertFileWithChunks } from '@shared/db/functions/files';
import { fileExtractionXberg } from '../file-extraction/file-extraction-xberg';
import { chunkAndEmbed } from '../rag/rag-service';

/**
 *
 * @param file: The file to be uploaded.
 * @param fileMetadata: Metadata associated with the file.
 * @param userId: The ID of the user uploading the file or null for shared chat.
 * @param federalStateId: The ID of the federal state associated with the user. For shared chat the federalStateId of the owner is used.
 *
 * @returns A promise that resolves to the ID of the uploaded file.
 */
export async function uploadFile({
  file,
  fileMetadata,
  userId,
  federalStateId,
}: {
  file: File;
  fileMetadata: FileMetadata;
  userId: string | null;
  federalStateId: string;
}): Promise<string> {
  const fileId = `file_${cnanoid()}`;
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const fileExtension = getFileExtension(file.name);

  if (isSupportedImageExtension(fileExtension)) {
    return uploadImageFile({
      fileId,
      file,
      fileExtension,
      buffer,
      fileMetadata,
      userId: userId,
    });
  }

  return uploadDocumentFile({
    fileId,
    file,
    fileExtension,
    buffer,
    fileMetadata,
    federalStateId,
    userId: userId,
  });
}

async function uploadImageFile({
  fileId,
  file,
  fileExtension,
  buffer,
  fileMetadata,
  userId,
}: {
  fileId: string;
  file: File;
  fileExtension: string;
  buffer: Buffer;
  fileMetadata: FileMetadata;
  userId: string | null;
}): Promise<string> {
  const {
    buffer: imageBuffer,
    metadata,
    type: processedType,
  } = await preprocessImage(buffer, fileExtension);

  const combinedMetadata = { ...metadata, ...fileMetadata };

  const processedName =
    processedType === fileExtension
      ? file.name
      : `${file.name.replace(/\.[^.]+$/, '')}.${processedType}`;

  await uploadMessageAttachment({ fileId, fileExtension: processedType, buffer: imageBuffer });
  await dbInsertFileWithChunks(
    {
      id: fileId,
      name: processedName,
      size: imageBuffer.length,
      type: processedType,
      metadata: combinedMetadata,
      userId: userId,
    },
    [],
  );

  return fileId;
}

async function uploadDocumentFile({
  fileId,
  file,
  fileExtension,
  buffer,
  fileMetadata,
  federalStateId,
  userId,
}: {
  fileId: string;
  file: File;
  fileExtension: string;
  buffer: Buffer;
  fileMetadata: FileMetadata;
  federalStateId: string;
  userId: string | null;
}): Promise<string> {
  const content = await fileExtractionXberg({ buffer, filename: file.name });

  const [chunks] = await Promise.all([
    chunkAndEmbed({ text: content, fileId, federalStateId }),
    uploadMessageAttachment({ fileId, fileExtension, buffer }),
  ]);

  await dbInsertFileWithChunks(
    {
      id: fileId,
      name: file.name,
      size: file.size,
      type: fileExtension,
      metadata: fileMetadata,
      userId,
    },
    chunks,
  );

  return fileId;
}
