import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@shared/error';

vi.mock('@/auth/requireValidInviteCode', () => ({
  requireValidInviteCode: vi.fn(),
}));
vi.mock('@/app/api/shared-chat/shared-chat-read-service', () => ({
  getSharedChatReadOnlySignedUrl: vi.fn(),
}));

import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { getSharedChatReadOnlySignedUrl } from '@/app/api/shared-chat/shared-chat-read-service';
import { GET } from './route';

const params = Promise.resolve({ fileId: 'file-1' });

function buildRequest(searchParams: string) {
  return new NextRequest(
    `https://example.com/api/v1/shared-chat/files/file-1/signed-url${searchParams}`,
  );
}

const validQuery =
  '?inviteCode=invite-1&entityType=character&entityId=character-1&sharedSessionId=session-1';

describe('GET /api/v1/shared-chat/files/[fileId]/signed-url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireValidInviteCode).mockResolvedValue({ chatInfo: {} } as never);
    vi.mocked(getSharedChatReadOnlySignedUrl).mockResolvedValue('https://signed.example/file');
  });

  it('parses query params and returns the signed url', async () => {
    const response = await GET(buildRequest(validQuery), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://signed.example/file' });
    expect(requireValidInviteCode).toHaveBeenCalledWith('invite-1');
    expect(getSharedChatReadOnlySignedUrl).toHaveBeenCalledWith({
      inviteCode: 'invite-1',
      entityType: 'character',
      entityId: 'character-1',
      sharedSessionId: 'session-1',
      fileId: 'file-1',
    });
  });

  it('returns 400 when required query params are missing', async () => {
    const response = await GET(buildRequest(''), { params });

    expect(response.status).toBe(400);
    expect(requireValidInviteCode).not.toHaveBeenCalled();
    expect(getSharedChatReadOnlySignedUrl).not.toHaveBeenCalled();
  });

  it('returns 400 when entityType is invalid', async () => {
    const response = await GET(
      buildRequest(
        '?inviteCode=invite-1&entityType=unknown&entityId=character-1&sharedSessionId=session-1',
      ),
      { params },
    );

    expect(response.status).toBe(400);
    expect(getSharedChatReadOnlySignedUrl).not.toHaveBeenCalled();
  });

  it('returns 403 when the file does not belong to the shared session', async () => {
    vi.mocked(getSharedChatReadOnlySignedUrl).mockRejectedValue(
      new ForbiddenError('Not authorized to access this file'),
    );

    const response = await GET(buildRequest(validQuery), { params });

    expect(response.status).toBe(403);
  });
});
