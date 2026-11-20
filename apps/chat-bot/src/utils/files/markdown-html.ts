import type { DocumentImageReferences } from './document-images';

async function prepareInteractiveHtml(
  source: string,
  imageReferences: DocumentImageReferences = new Map(),
): Promise<string> {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  for (const image of Array.from(parsed.images)) {
    const sourceUrl = image.getAttribute('src');
    if (sourceUrl !== null) {
      image.setAttribute('src', imageReferences.get(sourceUrl) ?? sourceUrl);
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
