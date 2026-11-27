export const GENERATED_DOCUMENT_FORMATS = ['docx', 'pdf', 'html', 'pptx'] as const;

export const PPTX_DESIGNS = ['classic', 'dark', 'ais', 'minimal'] as const;
export const DEFAULT_PPTX_DESIGN = 'classic';

export type PptxDesign = (typeof PPTX_DESIGNS)[number];

export type GeneratedDocumentFormat = (typeof GENERATED_DOCUMENT_FORMATS)[number];

export const MAX_FILE_NAME_LENGTH = 80;

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
