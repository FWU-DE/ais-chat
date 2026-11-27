import type { Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import {
  arrayBufferToBase64,
  type DocumentImageReferences,
  loadDocumentImage,
} from './document-images';
import { getReferencedImageSources, renderDocumentPlots } from './document-markdown';
import type { SharedChatDocumentRequest } from './generated-document';

export async function markdownToPdfBlob(
  markdown: string,
  imageReferences: DocumentImageReferences = new Map(),
  title = 'Dokument',
  sharedChat?: SharedChatDocumentRequest,
): Promise<Blob> {
  const root = unified().use(remarkParse).parse(markdown) as Root;
  const referencedSources = getReferencedImageSources(root);
  const images = await Promise.all(
    [...imageReferences.entries()]
      .filter(([source]) => referencedSources.has(source))
      .map(async ([source, url]) => {
        const loadedImage = await loadDocumentImage(url);
        return {
          source,
          mimeType: loadedImage.mimeType,
          data: arrayBufferToBase64(loadedImage.data),
        };
      }),
  );
  const plots = [...(await renderDocumentPlots(root))].map(([code, image]) => ({
    code,
    data: arrayBufferToBase64(image.data),
  }));
  const response = await fetch(
    sharedChat === undefined
      ? '/api/generate-document/pdf'
      : '/api/v1/shared-chat/generate-document/pdf',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        sharedChat === undefined
          ? { markdown, title, images, plots }
          : { ...sharedChat, images, plots },
      ),
    },
  );

  if (!response.ok) {
    throw new Error(`PDF generation failed: ${response.status}`);
  }
  return response.blob();
}
