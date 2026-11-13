import type { AllowedDocumentImages } from './document-images';

export const GENERATED_DOCUMENT_FORMATS = ['docx', 'html'] as const;

export type GeneratedDocumentFormat = (typeof GENERATED_DOCUMENT_FORMATS)[number];

const MAX_FILE_NAME_LENGTH = 80;

export function createGeneratedDocumentFileName(
  title: string | undefined,
  format: GeneratedDocumentFormat,
  fallbackTitle: string,
) {
  const filename = (title ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH)
    .replace(/^[.\s]+|[.\s]+$/g, '');

  return `${filename || fallbackTitle}.${format}`;
}

export async function createGeneratedDocumentBlob(
  markdown: string,
  format: GeneratedDocumentFormat,
  allowedImages: AllowedDocumentImages = new Map(),
  title?: string,
): Promise<Blob> {
  if (format === 'html') {
    const { markdownToHtmlBlob } = await import('./markdown-html');
    return markdownToHtmlBlob(markdown, title ?? titleFromMarkdown(markdown), allowedImages);
  }

  const { markdownToDocxBlob } = await import('./markdown-docx');
  return markdownToDocxBlob(
    { markdownBlocks: [{ markdown }] },
    { allowedImages, normalizeHtml: true },
  );
}

function titleFromMarkdown(markdown: string) {
  return /^\s*#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? 'Dokument';
}
