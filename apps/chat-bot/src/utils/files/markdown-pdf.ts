import { type AllowedDocumentImages, loadDocumentImage } from './document-images';

export async function markdownToPdfBlob(
  markdown: string,
  allowedImages: AllowedDocumentImages = new Map(),
  title = 'Generated document',
): Promise<Blob> {
  const images = await Promise.all(
    [...allowedImages.entries()].map(async ([source, url]) => {
      const loadedImage = await loadDocumentImage(url);
      return {
        source,
        mimeType: loadedImage.mimeType,
        data: btoa(String.fromCharCode(...new Uint8Array(loadedImage.data))),
      };
    }),
  );
  const response = await fetch('/api/generate-document/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, title, images }),
  });

  if (!response.ok) {
    throw new Error(`PDF generation failed: ${response.status}`);
  }
  return response.blob();
}
