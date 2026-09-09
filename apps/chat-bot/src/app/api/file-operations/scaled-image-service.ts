import sharp from 'sharp';
import { getFileFromS3 } from '@shared/s3';
import { dbGetFilesInIds } from '@shared/db/functions/files';
import { NotFoundError } from '@shared/error';
import { isSupportedImageExtension } from '@/const';
import { getImageContentType, streamToBuffer } from '@/utils/files/image-data';

export async function createScaledImage({
  fileId,
  width,
  height,
}: {
  fileId: string;
  width: number;
  height: number;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const [file] = await dbGetFilesInIds([fileId]);
  if (!file) {
    throw new NotFoundError(`File not found: ${fileId}`);
  }
  if (!isSupportedImageExtension(file.type)) {
    throw new NotFoundError(`File is not an image: ${fileId}`);
  }

  const imageStream = await getFileFromS3(`message_attachments/${fileId}`);
  const imageBuffer = await streamToBuffer(imageStream);
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const resizeOptions = {
    width: width,
    height: height,
    fit: 'inside' as const,
    withoutEnlargement: true,
  };

  const buffer = await image.resize(resizeOptions).toBuffer();

  return {
    buffer,
    contentType: getImageContentType(metadata.format) ?? '',
  };
}
