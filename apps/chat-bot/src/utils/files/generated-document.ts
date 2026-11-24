import type { DocumentImageReferences } from './document-images';
import type { GeneratedDocumentFormat } from './generated-document-format';
import { htmlToBlob } from './html-document';
import { markdownToDocxBlob } from './markdown-docx';
import { markdownToPdfBlob } from './markdown-pdf';

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
  { title, sharedChat }: { title?: string; sharedChat?: SharedChatDocumentContext } = {},
): Promise<Blob> {
  if (format === 'pdf') {
    return markdownToPdfBlob(content, imageReferences, title, sharedChat);
  }

  if (format === 'html') {
    return htmlToBlob(content, imageReferences);
  }

  return markdownToDocxBlob({ markdownBlocks: [{ markdown: content }] }, { imageReferences });
}
