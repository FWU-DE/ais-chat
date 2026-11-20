import type { DocumentImageReferences } from './document-images';
import { loadDocumentImage } from './document-images';

function arrayBufferToBase64(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

async function prepareInteractiveHtml(
  source: string,
  imageReferences: DocumentImageReferences = new Map(),
): Promise<string> {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  for (const image of Array.from(parsed.images)) {
    const sourceUrl = image.getAttribute('src');
    const imageUrl = sourceUrl === null ? undefined : imageReferences.get(sourceUrl);
    if (imageUrl !== undefined) {
      const { data, mimeType } = await loadDocumentImage(imageUrl);
      image.setAttribute('src', `data:${mimeType};base64,${arrayBufferToBase64(data)}`);
    }
  }
  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}

export async function markdownToHtmlBlob(
  html: string,
  imageReferences?: DocumentImageReferences,
): Promise<Blob> {
  const preparedSource = await prepareInteractiveHtml(html, imageReferences);
  return new Blob([preparedSource], { type: 'text/html;charset=utf-8' });
}
