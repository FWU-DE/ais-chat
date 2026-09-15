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

describe('getSharedChatReadOnlySignedUrls', () => {
  it('throws when shared session id is empty', async () => {
    const { getSharedChatReadOnlySignedUrls } = await import('./shared-chat-read-service');

    await expect(
      getSharedChatReadOnlySignedUrls({
        inviteCode: 'invite',
        entityType: 'character',
        entityId: 'character-1',
        fileIds: ['file-1'],
        sharedSessionId: '  ',
      }),
    ).rejects.toThrow('Not authorized to access this file');

    expect(mocks.getSharedChatEntityMock).not.toHaveBeenCalled();
    expect(mocks.dbGetFilesInIdsMock).not.toHaveBeenCalled();
  });

  it('returns an empty map without any lookups when no file ids are given', async () => {
    const { getSharedChatReadOnlySignedUrls } = await import('./shared-chat-read-service');

    const urls = await getSharedChatReadOnlySignedUrls({
      inviteCode: 'invite',
      entityType: 'character',
      entityId: 'character-1',
      fileIds: [],
      sharedSessionId: 'session-1',
    });

    expect(urls).toEqual({});
    expect(mocks.getSharedChatEntityMock).not.toHaveBeenCalled();
    expect(mocks.dbGetFilesInIdsMock).not.toHaveBeenCalled();
  });

  it('resolves signed urls for multiple files in a single entity/file lookup', async () => {
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
      {
        id: 'file-2',
        name: 'photo2.png',
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
    mocks.getReadOnlySignedUrlMock.mockImplementation(({ key }: { key: string }) =>
      Promise.resolve(`https://signed.example/${key}`),
    );

    const { getSharedChatReadOnlySignedUrls } = await import('./shared-chat-read-service');

    const urls = await getSharedChatReadOnlySignedUrls({
      inviteCode: 'invite',
      entityType: 'character',
      entityId: 'character-1',
      fileIds: ['file-1', 'file-2'],
      sharedSessionId: 'session-1',
    });

    expect(urls).toEqual({
      'file-1': 'https://signed.example/message_attachments/file-1',
      'file-2': 'https://signed.example/message_attachments/file-2',
    });
    expect(mocks.getSharedChatEntityMock).toHaveBeenCalledTimes(1);
    expect(mocks.dbGetFilesInIdsMock).toHaveBeenCalledTimes(1);
    expect(mocks.dbGetFilesInIdsMock).toHaveBeenCalledWith(['file-1', 'file-2']);
    expect(mocks.getReadOnlySignedUrlMock).toHaveBeenCalledWith({
      key: 'message_attachments/file-1',
      attachment: false,
      contentType: 'image/png',
    });
  });

  it('omits non-image files from the result instead of failing the whole batch', async () => {
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

    const { getSharedChatReadOnlySignedUrls } = await import('./shared-chat-read-service');

    const urls = await getSharedChatReadOnlySignedUrls({
      inviteCode: 'invite',
      entityType: 'character',
      entityId: 'character-1',
      fileIds: ['file-1'],
      sharedSessionId: 'session-1',
    });

    expect(urls).toEqual({});
    expect(mocks.getReadOnlySignedUrlMock).not.toHaveBeenCalled();
  });

  it('omits files belonging to an authenticated user from the result', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([
      {
        id: 'file-1',
        name: 'photo.png',
        type: 'png',
        userId: 'user-1',
      },
    ]);

    const { getSharedChatReadOnlySignedUrls } = await import('./shared-chat-read-service');

    const urls = await getSharedChatReadOnlySignedUrls({
      inviteCode: 'invite',
      entityType: 'learningScenario',
      entityId: 'learning-scenario-1',
      fileIds: ['file-1'],
      sharedSessionId: 'session-1',
    });

    expect(urls).toEqual({});
    expect(mocks.getReadOnlySignedUrlMock).not.toHaveBeenCalled();
  });

  it('omits files that do not belong to the shared session from the result', async () => {
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

    const { getSharedChatReadOnlySignedUrls } = await import('./shared-chat-read-service');

    const urls = await getSharedChatReadOnlySignedUrls({
      inviteCode: 'invite',
      entityType: 'character',
      entityId: 'character-1',
      fileIds: ['file-1'],
      sharedSessionId: 'session-1',
    });

    expect(urls).toEqual({});
    expect(mocks.getReadOnlySignedUrlMock).not.toHaveBeenCalled();
  });
});
