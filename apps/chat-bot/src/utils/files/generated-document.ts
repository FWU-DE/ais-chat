import type { DocumentImageReferences } from './document-images';
import type { GeneratedDocumentFormat } from './generated-document-format';

export async function createGeneratedDocumentBlob(
  markdown: string,
  format: GeneratedDocumentFormat,
  imageReferences?: DocumentImageReferences,
): Promise<Blob> {
  if (format === 'html') {
    const { markdownToHtmlBlob } = await import('./markdown-html');
    return markdownToHtmlBlob(markdown, titleFromMarkdown(markdown), imageReferences);
  }

  const { markdownToDocxBlob } = await import('./markdown-docx');
  return markdownToDocxBlob({ markdownBlocks: [{ markdown }] }, { imageReferences });
}

function titleFromMarkdown(markdown: string) {
  return /^\s*#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? 'Dokument';
}
