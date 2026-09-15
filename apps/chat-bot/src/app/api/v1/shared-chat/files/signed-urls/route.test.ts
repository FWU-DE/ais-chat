import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/auth/requireValidInviteCode', () => ({
  requireValidInviteCode: vi.fn(),
}));
vi.mock('@/app/api/shared-chat/shared-chat-read-service', () => ({
  getSharedChatReadOnlySignedUrls: vi.fn(),
}));

import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { getSharedChatReadOnlySignedUrls } from '@/app/api/shared-chat/shared-chat-read-service';
import { POST } from './route';

function buildRequest(body: unknown) {
  return new NextRequest('https://example.com/api/v1/shared-chat/files/signed-urls', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function buildRawRequest(body: string) {
  return new NextRequest('https://example.com/api/v1/shared-chat/files/signed-urls', {
    method: 'POST',
    body,
  });
}

const validBody = {
  inviteCode: 'invite-1',
  entityType: 'character',
  entityId: 'character-1',
  sharedSessionId: 'session-1',
  fileIds: ['file-1', 'file-2'],
};

describe('POST /api/v1/shared-chat/files/signed-urls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireValidInviteCode).mockResolvedValue({ chatInfo: {} } as never);
    vi.mocked(getSharedChatReadOnlySignedUrls).mockResolvedValue({
      'file-1': 'https://signed.example/file-1',
      'file-2': 'https://signed.example/file-2',
    });
  });

  it('parses the body and returns signed urls for a batch of files', async () => {
    const response = await POST(buildRequest(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      urls: {
        'file-1': 'https://signed.example/file-1',
        'file-2': 'https://signed.example/file-2',
      },
    });
    expect(requireValidInviteCode).toHaveBeenCalledWith('invite-1');
    expect(getSharedChatReadOnlySignedUrls).toHaveBeenCalledWith({
      inviteCode: 'invite-1',
      entityType: 'character',
      entityId: 'character-1',
      sharedSessionId: 'session-1',
      fileIds: ['file-1', 'file-2'],
    });
  });

  it('returns 400 when fileIds is missing or empty', async () => {
    const response = await POST(buildRequest({ ...validBody, fileIds: [] }));

    expect(response.status).toBe(400);
    expect(getSharedChatReadOnlySignedUrls).not.toHaveBeenCalled();
  });

  it('returns 400 when fileIds exceeds the batch size limit', async () => {
    const response = await POST(
      buildRequest({
        ...validBody,
        fileIds: Array.from({ length: 101 }, (_, index) => `file-${index}`),
      }),
    );

    expect(response.status).toBe(400);
    expect(getSharedChatReadOnlySignedUrls).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const response = await POST(buildRawRequest('not-json'));

    expect(response.status).toBe(400);
    expect(getSharedChatReadOnlySignedUrls).not.toHaveBeenCalled();
  });

  it('returns 400 when required fields are missing', async () => {
    const response = await POST(buildRequest({ fileIds: ['file-1'] }));

    expect(response.status).toBe(400);
    expect(getSharedChatReadOnlySignedUrls).not.toHaveBeenCalled();
  });
});
