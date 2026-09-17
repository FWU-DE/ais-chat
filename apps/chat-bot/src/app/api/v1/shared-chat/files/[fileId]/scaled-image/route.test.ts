import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@shared/error';

const mocks = vi.hoisted(() => ({
  verifySharedChatImageAccessMock: vi.fn(),
  createScaledImageMock: vi.fn(),
}));

vi.mock('@/app/api/shared-chat/shared-chat-read-service', () => ({
  verifySharedChatImageAccess: mocks.verifySharedChatImageAccessMock,
}));
vi.mock('@/app/api/file-operations/scaled-image-service', () => ({
  createScaledImage: mocks.createScaledImageMock,
}));

import { GET } from './route';

const params = Promise.resolve({ fileId: 'file-1' });
const validQuery =
  '?inviteCode=invite-1&entityType=character&entityId=character-1&sharedSessionId=session-1&width=100&height=200';

function buildRequest(searchParams: string) {
  return new NextRequest(
    `https://example.com/api/v1/shared-chat/files/file-1/scaled-image${searchParams}`,
  );
}

describe('GET /api/v1/shared-chat/files/[fileId]/scaled-image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySharedChatImageAccessMock.mockResolvedValue(undefined);
    mocks.createScaledImageMock.mockResolvedValue({
      buffer: Buffer.from('image-data'),
      contentType: 'image/png',
    });
  });

  it('validates access and returns the scaled image', async () => {
    const response = await GET(buildRequest(validQuery), { params });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(await response.text()).toBe('image-data');
    expect(mocks.verifySharedChatImageAccessMock).toHaveBeenCalledWith({
      inviteCode: 'invite-1',
      entityType: 'character',
      entityId: 'character-1',
      sharedSessionId: 'session-1',
      fileId: 'file-1',
      width: 100,
      height: 200,
    });
    expect(mocks.createScaledImageMock).toHaveBeenCalledWith({
      fileId: 'file-1',
      width: 100,
      height: 200,
    });
  });

  it('returns 400 when request parameters are invalid', async () => {
    const response = await GET(buildRequest(''), { params });

    expect(response.status).toBe(400);
    expect(mocks.createScaledImageMock).not.toHaveBeenCalled();
  });

  it('returns 403 when shared access is rejected', async () => {
    mocks.verifySharedChatImageAccessMock.mockRejectedValue(
      new ForbiddenError('Not authorized to access this file'),
    );

    const response = await GET(buildRequest(validQuery), { params });

    expect(response.status).toBe(403);
    expect(mocks.createScaledImageMock).not.toHaveBeenCalled();
  });
});
