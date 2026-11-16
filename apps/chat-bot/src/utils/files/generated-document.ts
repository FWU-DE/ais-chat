import type { DocumentImageReferences } from './document-images';
import type { GeneratedDocumentFormat } from './generated-document-format';

// Lets the server verify that a PDF is rendered from a document of this shared conversation.
export type SharedChatDocumentContext = {
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: string;
};

export async function createGeneratedDocumentBlob(
  content: string,
  format: GeneratedDocumentFormat,
  imageReferences?: DocumentImageReferences,
  title?: string,
  sharedChat?: SharedChatDocumentContext,
): Promise<Blob> {
  if (format === 'pdf') {
    const { markdownToPdfBlob } = await import('./markdown-pdf');
    return markdownToPdfBlob(content, imageReferences, title ?? 'Generated document', sharedChat);
  }

  if (format === 'html') {
    const { markdownToHtmlBlob } = await import('./markdown-html');
    return markdownToHtmlBlob(content, imageReferences);
  }

  const { markdownToDocxBlob } = await import('./markdown-docx');
  return markdownToDocxBlob({ markdownBlocks: [{ markdown: content }] }, { imageReferences });
}
