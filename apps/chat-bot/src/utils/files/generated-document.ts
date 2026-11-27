import type { DocumentImageReferences } from './document-images';
import type { GeneratedDocumentFormat, PptxDesign } from './generated-document-format';
import { htmlToBlob } from './html-document';
import { markdownToDocxBlob } from './markdown-docx';
import { markdownToPdfBlob } from './markdown-pdf';
import { markdownToPptxBlob } from './markdown-pptx';

export type SharedChatDocumentContext = {
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: string;
};

// The server renders the PDF from the stored generate_document call with this id.
export type SharedChatDocumentRequest = SharedChatDocumentContext & { toolCallId: string };

export async function createGeneratedDocumentBlob(
  content: string,
  format: GeneratedDocumentFormat,
  imageReferences?: DocumentImageReferences,
  {
    title,
    sharedChat,
    design,
  }: { title?: string; sharedChat?: SharedChatDocumentRequest; design?: PptxDesign } = {},
): Promise<Blob> {
  if (format === 'pdf') {
    return markdownToPdfBlob(content, imageReferences, title, sharedChat);
  }

  if (format === 'html') {
    return htmlToBlob(content, imageReferences);
  }

  if (format === 'pptx') {
    return markdownToPptxBlob(content, imageReferences, title, design);
  }

  return markdownToDocxBlob({ markdownBlocks: [{ markdown: content }] }, { imageReferences });
}
