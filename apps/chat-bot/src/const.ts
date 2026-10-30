export const SUPPORTED_DOCUMENTS_EXTENSIONS = [
  'csv',
  'docx',
  'htm',
  'html',
  'md',
  'odp',
  'ods',
  'odt',
  'pdf',
  'pptx',
  'tex',
  'txt',
  'xlsx',
] as const;

export const SUPPORTED_IMAGE_EXTENSIONS = ['jpeg', 'jpg', 'png', 'svg', 'webp'] as const;

export const SUPPORTED_FILE_EXTENSIONS = [
  ...SUPPORTED_DOCUMENTS_EXTENSIONS,
  ...SUPPORTED_IMAGE_EXTENSIONS,
] as const;

export type SupportedDocumentExtension = (typeof SUPPORTED_DOCUMENTS_EXTENSIONS)[number];
export type SupportedImageExtension = (typeof SUPPORTED_IMAGE_EXTENSIONS)[number];
export type SupportedFileExtension = (typeof SUPPORTED_FILE_EXTENSIONS)[number];

export function isSupportedDocumentExtension(
  extension: string,
): extension is SupportedDocumentExtension {
  return SUPPORTED_DOCUMENTS_EXTENSIONS.includes(extension as SupportedDocumentExtension);
}

export function isSupportedImageExtension(extension: string): extension is SupportedImageExtension {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(extension as SupportedImageExtension);
}

export function isSupportedFileExtension(extension: string): extension is SupportedFileExtension {
  return SUPPORTED_FILE_EXTENSIONS.includes(extension as SupportedFileExtension);
}

/**
 * The maximum size in pixels (width or height) of an avatar. Larger images will be scaled down.
 * The maximum CSS size for avatars is 170px in the UI. For high DPR screens, we allow images up to 2x the maximum CSS size to ensure they look sharp.
 */
export const AVATAR_MAX_SIZE = 340;

export const TRUNCATE_IMAGE_HEIGHT = 720;

export const MAX_FILE_SIZE = 20_000_000; // 20MB

/**
 * Ceiling for a whole multipart upload body, checked before the request is parsed.
 * The slack above MAX_FILE_SIZE covers part boundaries, headers and the other form fields.
 */
export const MAX_UPLOAD_BODY_SIZE = MAX_FILE_SIZE + 1_000_000;

/** Upper bound for the requested dimensions of a scaled image, to cap decoding work per request. */
export const MAX_SCALED_IMAGE_DIMENSION = 1000;

export const EMBEDDING_BATCH_SIZE = 100;

/**
 * Maximum number of concurrent requests.
 * IONOS rate limiting is 5 requests/second.
 * https://docs.ionos.com/cloud/ai/ai-model-hub/tutorials/rate-limits
 *
 * Note: this is just a simple check, it does not scale horizontally when the application is deployed with multiple pods
 */
export const EMBEDDING_MAX_CONCURRENT_REQUESTS = 5;
