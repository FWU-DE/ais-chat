import { MAX_UPLOAD_BODY_SIZE } from '@/const';

/**
 * Rejects an oversized upload before `formData()` buffers the whole multipart body.
 * A missing or malformed header passes, so the size guard in `uploadFile` still has to run.
 */
export function isUploadBodyTooLarge(request: Request): boolean {
  const contentLength = Number(request.headers.get('content-length'));

  return Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BODY_SIZE;
}
