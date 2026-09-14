import { NotFoundError } from '@shared/error';
import { dbGetFilesInIds } from '@shared/db/functions/files';
import { getFileFromS3 } from '@shared/s3';
import { LlmModelSelectModel } from '@shared/db/schema';
import { ImageGenerationInputImage } from '@ais-chat/ai-core/images/types';
import { getImageContentType, streamToBuffer } from '@/utils/files/image-data';
import { IMAGE_GENERATION_INPUT_LIMIT } from '@/configuration-text-inputs/const';

export function validateInputFiles({
  model,
  inputFileIds,
}: {
  model: LlmModelSelectModel;
  inputFileIds: string[];
}) {
  const modelSupportsImageInput = (model.supportedImageFormats?.length ?? 0) > 0;
  if (inputFileIds.length > 0 && !modelSupportsImageInput) {
    throw new Error('Selected image model does not support image inputs');
  }

  if (inputFileIds.length > IMAGE_GENERATION_INPUT_LIMIT) {
    throw new Error(
      `Too many input images: ${inputFileIds.length} exceeds the limit of ${IMAGE_GENERATION_INPUT_LIMIT}`,
    );
  }
}

export async function fetchInputImages({
  inputFileIds,
  userId,
}: {
  inputFileIds: string[];
  userId: string;
}): Promise<ImageGenerationInputImage[]> {
  if (inputFileIds.length === 0) return [];

  const recordsById = new Map((await dbGetFilesInIds(inputFileIds)).map((file) => [file.id, file]));

  return Promise.all(
    inputFileIds.map(async (fileId) => {
      const record = recordsById.get(fileId);

      if (!record || record.userId !== userId) {
        throw new NotFoundError(`Input file not found or not owned by user: ${fileId}`);
      }

      const mimeType = getImageContentType(record.type);
      if (!mimeType.startsWith('image/')) {
        throw new Error(`Input file is not an image: ${fileId}`);
      }

      const stream = await getFileFromS3(`message_attachments/${fileId}`);
      const data = await streamToBuffer(stream);

      return {
        data,
        mimeType,
        filename: record.name,
      };
    }),
  );
}
