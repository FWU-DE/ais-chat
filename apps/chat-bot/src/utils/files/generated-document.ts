import type { DocumentImageReferences } from './document-images';
import type { GeneratedDocumentFormat } from './generated-document-format';

export async function createGeneratedDocumentBlob(
  content: string,
  format: GeneratedDocumentFormat,
  imageReferences?: DocumentImageReferences,
): Promise<Blob> {
  if (format === 'html') {
    const { markdownToHtmlBlob } = await import('./markdown-html');
    return markdownToHtmlBlob(content, imageReferences);
  }

  const { markdownToDocxBlob } = await import('./markdown-docx');
  return markdownToDocxBlob({ markdownBlocks: [{ markdown: content }] }, { imageReferences });
}
