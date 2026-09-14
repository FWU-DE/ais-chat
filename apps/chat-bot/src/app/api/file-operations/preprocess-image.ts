import { TRUNCATE_IMAGE_HEIGHT } from '@/const';
import { FileMetadata, FileModel } from '@shared/db/schema';
import { getFileFromS3, getReadOnlySignedUrl } from '@shared/s3';
import { isImageFile } from '@/utils/files/generic';
import { getImageContentType, streamToBase64 } from '@/utils/files/image-data';
import sharp from 'sharp';
import { logError } from '@shared/logging';
import { ChatAttachment } from '@ais-chat/ai-core';

export type ChatAttachmentWithMessageId = ChatAttachment & {
  messageId: string;
};

/**
 * fetch the signed url for the image files and return them as ChatImageAttachment
 */
export async function createImageAttachmentsForConversation(
  relatedFileEntities: (FileModel & { conversationMessageId?: string })[],
  imageAttachmentType: 'url' | 'base64',
): Promise<ChatAttachmentWithMessageId[]> {
  const imageFiles = relatedFileEntities
    .filter((file) => isImageFile(file.name))
    .filter(hasMessageId);

  if (imageFiles.length === 0) {
    return [];
  }

  const imagePromises = imageFiles.map(async (file) => {
    let url: string;
    const contentType = getImageContentType(file.type);

    try {
      if (imageAttachmentType === 'url') {
        url = await getReadOnlySignedUrl({ key: `message_attachments/${file.id}` });
      } else if (imageAttachmentType === 'base64') {
        const fileStream = await getFileFromS3(`message_attachments/${file.id}`);
        const base64ImageData = await streamToBase64(fileStream);
        url = `data:${contentType};base64,${base64ImageData}`;
      } else {
        throw new Error(`Unsupported image attachment type: ${imageAttachmentType}`);
      }

      return {
        type: 'image' as const,
        url,
        contentType,
        messageId: file.conversationMessageId,
      };
    } catch (error) {
      logError(`Failed to process image file ${file.id}`, error);
      return undefined;
    }
  });

  const images = await Promise.all(imagePromises);
  return images.filter((img) => img !== undefined);
}

const DEFAULT_SVG_DENSITY = 72;
const MAX_SVG_DENSITY = 100_000; // sharp's upper limit for vector rasterisation

/**
 * sharp rasterises SVGs at their intrinsic size, so small vector graphics can turn into tiny
 * bitmaps that look blurry when displayed. Increase the density so the largest side is
 * rasterised up to TRUNCATE_IMAGE_HEIGHT before any further resizing is applied.
 */
async function rasterizeSvgToPng(fileContent: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(fileContent).metadata();
  const largestSide = Math.max(width ?? 0, height ?? 0);
  const density =
    largestSide > 0 && largestSide < TRUNCATE_IMAGE_HEIGHT
      ? Math.min(
          Math.round((TRUNCATE_IMAGE_HEIGHT / largestSide) * DEFAULT_SVG_DENSITY),
          MAX_SVG_DENSITY,
        )
      : DEFAULT_SVG_DENSITY;

  return sharp(fileContent, { density }).png().toBuffer();
}

export async function preprocessImage(
  fileContent: Buffer,
  type: string,
): Promise<{ buffer: Buffer; metadata: FileMetadata; type: string }> {
  // Convert SVG to PNG if needed
  let processedBuffer = fileContent;
  let processedType = type;
  if (type === 'svg') {
    try {
      processedBuffer = await rasterizeSvgToPng(fileContent);
      processedType = 'png';
    } catch {
      throw new Error('Failed to convert SVG to PNG');
    }
  }

  const metadata = await sharp(processedBuffer).metadata();

  let width = metadata.width ?? 0;
  let height = metadata.height ?? 0;
  if (height > TRUNCATE_IMAGE_HEIGHT) {
    const aspectRatio = width / height;
    height = TRUNCATE_IMAGE_HEIGHT;
    width = Math.round(height * aspectRatio);

    // Process the image with scaling
    const finalBuffer = await sharp(processedBuffer)
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();

    return {
      buffer: finalBuffer,
      metadata: { width, height },
      type: processedType,
    };
  }

  // Return processed buffer (converted from SVG if needed) if no scaling needed
  return {
    buffer: processedBuffer,
    metadata: { width, height },
    type: processedType,
  };
}

// returns true if the file has a conversationMessageId which is needed to
// associate the image with the correct message in the chat history
// An image file without a conversationMessageId is likely not possible atm.
function hasMessageId(
  file: FileModel & { conversationMessageId?: string },
): file is FileModel & { conversationMessageId: string } {
  return file.conversationMessageId !== undefined;
}
