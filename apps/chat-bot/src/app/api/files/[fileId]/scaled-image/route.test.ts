import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { NotFoundError } from '@shared/error';

vi.mock('@/auth/utils', () => ({
  getUser: vi.fn(),
}));
vi.mock('@shared/db/functions/files', () => ({
  dbVerifyFileOwnership: vi.fn(),
}));
vi.mock('@/app/api/file-operations/scaled-image-service', () => ({
  createScaledImage: vi.fn(),
}));

import { getUser } from '@/auth/utils';
import { dbVerifyFileOwnership } from '@shared/db/functions/files';
import { createScaledImage } from '@/app/api/file-operations/scaled-image-service';
import { GET } from './route';

const params = Promise.resolve({ fileId: 'file-1' });

function buildRequest(searchParams: string) {
  return new NextRequest(`https://example.com/api/files/file-1/scaled-image${searchParams}`);
}

describe('GET /api/files/[fileId]/scaled-image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(dbVerifyFileOwnership).mockResolvedValue(true);
    vi.mocked(createScaledImage).mockResolvedValue({
      buffer: Buffer.from('image-data'),
      contentType: 'image/png',
    } as never);
  });

  it('parses width/height query params and returns the scaled image', async () => {
    const response = await GET(buildRequest('?width=100&height=200'), { params });

    expect(response.status).toBe(200);
    expect(createScaledImage).toHaveBeenCalledWith({
      fileId: 'file-1',
      width: 100,
      height: 200,
    });
  });

  it('returns 400 when width/height are missing', async () => {
    const response = await GET(buildRequest(''), { params });

    expect(response.status).toBe(400);
    expect(createScaledImage).not.toHaveBeenCalled();
  });

  it('returns 400 when width/height are invalid', async () => {
    const response = await GET(buildRequest('?width=abc&height=200'), { params });

    expect(response.status).toBe(400);
    expect(createScaledImage).not.toHaveBeenCalled();
  });

  it('returns 403 when the user does not own the file', async () => {
    vi.mocked(dbVerifyFileOwnership).mockResolvedValue(false);

    const response = await GET(buildRequest('?width=100&height=200'), { params });

    expect(response.status).toBe(403);
    expect(createScaledImage).not.toHaveBeenCalled();
  });

  it('returns 404 when createScaledImage reports the file is not an image', async () => {
    vi.mocked(createScaledImage).mockRejectedValue(new NotFoundError('File is not an image'));

    const response = await GET(buildRequest('?width=100&height=200'), { params });

    expect(response.status).toBe(404);
  });
});
