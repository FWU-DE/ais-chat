const MAX_DOCUMENT_IMAGE_SIZE = 240;

export type DocumentImageReferences = ReadonlyMap<string, string>;

export function getDocumentAttachmentReference(fileId: string) {
  return `attachment://${encodeURIComponent(fileId)}`;
}

export function arrayBufferToBase64(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export type LoadedDocumentImage = {
  data: ArrayBuffer;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
};

// Scales images down to the page width and converts formats the document libraries can't embed.
export async function loadDocumentImage(
  url: string,
  maxSize = MAX_DOCUMENT_IMAGE_SIZE,
): Promise<LoadedDocumentImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load image: ${response.status}`);
  }

  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSize / bitmap.width, maxSize / bitmap.height);
  const mimeType = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const isEmbeddable = blob.type === 'image/png' || blob.type === 'image/jpeg';

  if (scale === 1 && isEmbeddable) {
    const result: LoadedDocumentImage = {
      data: await blob.arrayBuffer(),
      mimeType,
      width: bitmap.width,
      height: bitmap.height,
    };
    bitmap.close();
    return result;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    throw new Error('Failed to create image canvas context');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result === null ? reject(new Error('Failed to encode image')) : resolve(result)),
      'image/png',
    );
  });
  return {
    data: await png.arrayBuffer(),
    mimeType: 'image/png',
    width: canvas.width,
    height: canvas.height,
  };
}
