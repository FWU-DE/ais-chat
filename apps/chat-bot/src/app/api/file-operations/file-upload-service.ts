import { isSupportedImageExtension, MAX_FILE_SIZE } from '@/const';
import { parseSupportedFileExtension } from '@/utils/files/generic';
import { dbInsertFileWithChunks } from '@shared/db/functions/files';
import { FileMetadata } from '@shared/db/schema';
import { InvalidArgumentError } from '@shared/error';
import { uploadMessageAttachment } from '@shared/files/fileService';
import { cnanoid } from '@shared/random/randomService';
import { fileExtractionXberg } from '../file-extraction/file-extraction-xberg';
import { chunkAndEmbed } from '../rag/rag-service';
import { preprocessImage } from './preprocess-image';

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
  // The routes already buffered the multipart body; rejecting here still avoids the arrayBuffer
  // copy, image decoding, text extraction and S3 upload.
  const fileExtension = parseSupportedFileExtension(file.name);
  if (fileExtension === undefined) {
    throw new InvalidArgumentError('Unsupported file type');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new InvalidArgumentError(
      `File exceeds the maximum size of ${MAX_FILE_SIZE} bytes: ${file.size}`,
    );
  }

  const fileId = `file_${cnanoid()}`;
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

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
