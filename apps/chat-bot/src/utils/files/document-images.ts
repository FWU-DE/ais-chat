const MAX_DOCUMENT_IMAGE_SIZE = 240;

export type DocumentImageReferences = ReadonlyMap<string, string>;

export function getDocumentAttachmentReference(fileId: string) {
  return `attachment://${encodeURIComponent(fileId)}`;
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
  return png.arrayBuffer();
}
