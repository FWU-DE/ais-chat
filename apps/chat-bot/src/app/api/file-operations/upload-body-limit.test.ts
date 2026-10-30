import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BODY_SIZE } from '@/const';
import { isUploadBodyTooLarge } from './upload-body-limit';

function requestWithContentLength(contentLength?: string): Request {
  return new Request('https://example.com/api/v1/files', {
    method: 'POST',
    headers: contentLength === undefined ? {} : { 'content-length': contentLength },
  });
}

describe('isUploadBodyTooLarge', () => {
  it('rejects a body above the ceiling', () => {
    expect(isUploadBodyTooLarge(requestWithContentLength(`${MAX_UPLOAD_BODY_SIZE + 1}`))).toBe(
      true,
    );
  });

  it('accepts a body at the ceiling', () => {
    expect(isUploadBodyTooLarge(requestWithContentLength(`${MAX_UPLOAD_BODY_SIZE}`))).toBe(false);
  });

  it('passes through when the header is missing or unparsable', () => {
    expect(isUploadBodyTooLarge(requestWithContentLength())).toBe(false);
    expect(isUploadBodyTooLarge(requestWithContentLength('not-a-number'))).toBe(false);
  });
});
