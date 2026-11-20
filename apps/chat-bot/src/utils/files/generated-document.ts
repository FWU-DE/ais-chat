import type { DocumentImageReferences } from './document-images';
import type { GeneratedDocumentFormat } from './generated-document-format';

export async function createGeneratedDocumentBlob(
  markdown: string,
  format: GeneratedDocumentFormat,
  imageReferences?: DocumentImageReferences,
): Promise<Blob> {
  const { markdownToDocxBlob } = await import('./markdown-docx');
  return markdownToDocxBlob({ markdownBlocks: [{ markdown }] }, { imageReferences });
}
