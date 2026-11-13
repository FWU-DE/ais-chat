import type { FileModel } from '@shared/db/schema';

import { isImageFile } from '@/utils/files/generic';

// Maps the file name of an image uploaded in the chat to the URL it can be loaded from.
export type AllowedDocumentImages = ReadonlyMap<string, string>;

type UploadedFile = Pick<FileModel, 'id' | 'name'> & { localUrl?: string };
type UploadedFiles = ReadonlyMap<string, readonly UploadedFile[]>;

const MAX_DOCUMENT_IMAGE_SIZE = 240;

function normalizeImageReference(reference: string) {
  let decoded = reference;
  try {
    decoded = decodeURIComponent(reference);
  } catch {
    // Keep the original value when the Markdown URL is not valid URI syntax.
  }
  return decoded.replaceAll('\\', '/').split('/').at(-1)?.trim().toLowerCase() ?? '';
}

// Only images the user uploaded in this chat qualify; the model can reference them by file name.
// Without `fileMapping` (shared chats) only the local preview URLs are available.
export function collectUploadedImageUrls({
  fileMapping,
  messageFileMapping,
}: {
  fileMapping?: UploadedFiles;
  messageFileMapping?: UploadedFiles;
}): AllowedDocumentImages {
  const images = new Map<string, string>();

  for (const files of [fileMapping?.values(), messageFileMapping?.values()]) {
    for (const fileList of files ?? []) {
      for (const file of fileList) {
        if (!isImageFile(file.name)) {
          continue;
        }
        const url =
          file.localUrl ??
          (fileMapping === undefined
            ? undefined
            : `/api/files/${file.id}/scaled-image?width=${MAX_DOCUMENT_IMAGE_SIZE}&height=${MAX_DOCUMENT_IMAGE_SIZE}`);
        if (url !== undefined) {
          images.set(normalizeImageReference(file.name), url);
        }
      }
    }
  }

  return images;
}

// The reference must be the exact file name; URLs and paths never match.
export function findAllowedImageUrl(reference: string, allowedImages: AllowedDocumentImages) {
  return allowedImages.get(normalizeImageReference(reference));
}

// Scales images down to the page width and converts formats the document libraries can't embed.
export async function loadDocumentImage(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load image: ${response.status}`);
  }

  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(
    1,
    MAX_DOCUMENT_IMAGE_SIZE / bitmap.width,
    MAX_DOCUMENT_IMAGE_SIZE / bitmap.height,
  );
  const isEmbeddable = blob.type === 'image/png' || blob.type === 'image/jpeg';

  if (scale === 1 && isEmbeddable) {
    bitmap.close();
    return blob.arrayBuffer();
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result === null ? reject(new Error('Failed to encode image')) : resolve(result)),
      'image/png',
    );
  });
  return png.arrayBuffer();
}
