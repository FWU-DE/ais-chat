import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSharedChatEntityMock: vi.fn(),
  dbGetFilesInIdsMock: vi.fn(),
  getReadOnlySignedUrlMock: vi.fn(),
}));

vi.mock('./shared-chat-get-entity', () => ({
  getSharedChatEntity: mocks.getSharedChatEntityMock,
}));

vi.mock('@shared/db/functions/files', () => ({
  dbGetFilesInIds: mocks.dbGetFilesInIdsMock,
}));

vi.mock('@shared/s3', () => ({
  getReadOnlySignedUrl: mocks.getReadOnlySignedUrlMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSharedChatEntityMock.mockResolvedValue({
    id: 'character-1',
    startedBy: 'teacher-1',
    expiredAt: new Date('2099-01-01'),
    isDeleted: false,
    suspended: false,
    manuallyStoppedAt: null,
  });
  mocks.getReadOnlySignedUrlMock.mockResolvedValue('https://signed.example/file');
});

describe('getSharedChatReadOnlySignedUrl', () => {
  it('throws when shared session id is empty', async () => {
    const { getSharedChatReadOnlySignedUrl } = await import('./shared-chat-read-service');

    await expect(
      getSharedChatReadOnlySignedUrl({
        inviteCode: 'invite',
        entityType: 'character',
        entityId: 'character-1',
        fileId: 'file-1',
        sharedSessionId: '  ',
      }),
    ).rejects.toThrow('Not authorized to access this file');

    expect(mocks.getSharedChatEntityMock).not.toHaveBeenCalled();
    expect(mocks.dbGetFilesInIdsMock).not.toHaveBeenCalled();
  });

  it('returns signed url for anonymous shared file after invite validation', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([
      {
        id: 'file-1',
        name: 'photo.png',
        type: 'png',
        metadata: {
          inviteCode: 'invite',
          entityType: 'character',
          entityId: 'character-1',
          sessionId: 'session-1',
        },
        userId: null,
      },
    ]);

    const { getSharedChatReadOnlySignedUrl } = await import('./shared-chat-read-service');

    const signedUrl = await getSharedChatReadOnlySignedUrl({
      inviteCode: 'invite',
      entityType: 'character',
      entityId: 'character-1',
      fileId: 'file-1',
      sharedSessionId: 'session-1',
    });

    expect(signedUrl).toBe('https://signed.example/file');
    expect(mocks.getSharedChatEntityMock).toHaveBeenCalledWith({
      inviteCode: 'invite',
      entityType: 'character',
      entityId: 'character-1',
    });
    expect(mocks.getReadOnlySignedUrlMock).toHaveBeenCalledWith({
      key: 'message_attachments/file-1',
      attachment: false,
      contentType: 'image/png',
    });
  });

  it('throws when the file is not an image', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([
      {
        id: 'file-1',
        name: 'notes.pdf',
        type: 'pdf',
        metadata: {
          inviteCode: 'invite',
          entityType: 'character',
          entityId: 'character-1',
          sessionId: 'session-1',
        },
        userId: null,
      },
    ]);

    const { getSharedChatReadOnlySignedUrl } = await import('./shared-chat-read-service');

    await expect(
      getSharedChatReadOnlySignedUrl({
        inviteCode: 'invite',
        entityType: 'character',
        entityId: 'character-1',
        fileId: 'file-1',
        sharedSessionId: 'session-1',
      }),
    ).rejects.toThrow('Only image attachments can be accessed through this endpoint');

    expect(mocks.getReadOnlySignedUrlMock).not.toHaveBeenCalled();
  });

  it('throws when file belongs to an authenticated user', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([
      {
        id: 'file-1',
        name: 'photo.png',
        type: 'png',
        userId: 'user-1',
      },
    ]);

    const { getSharedChatReadOnlySignedUrl } = await import('./shared-chat-read-service');

    await expect(
      getSharedChatReadOnlySignedUrl({
        inviteCode: 'invite',
        entityType: 'learningScenario',
        entityId: 'learning-scenario-1',
        fileId: 'file-1',
        sharedSessionId: 'session-1',
      }),
    ).rejects.toThrow('Not authorized to use one or more files');
  });

  it('throws when shared session id does not match file metadata', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([
      {
        id: 'file-1',
        name: 'photo.png',
        type: 'png',
        metadata: {
          inviteCode: 'invite',
          entityType: 'character',
          entityId: 'character-1',
          sessionId: 'other-session',
        },
        userId: null,
      },
    ]);

    const { getSharedChatReadOnlySignedUrl } = await import('./shared-chat-read-service');

    await expect(
      getSharedChatReadOnlySignedUrl({
        inviteCode: 'invite',
        entityType: 'character',
        entityId: 'character-1',
        fileId: 'file-1',
        sharedSessionId: 'session-1',
      }),
    ).rejects.toThrow('Not authorized to access this file');
  });
});
