import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSharedChatEntityMock: vi.fn(),
  dbGetFilesInIdsMock: vi.fn(),
}));

vi.mock('./shared-chat-get-entity', () => ({
  getSharedChatEntity: mocks.getSharedChatEntityMock,
}));

vi.mock('@shared/db/functions/files', () => ({
  dbGetFilesInIds: mocks.dbGetFilesInIdsMock,
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
});

describe('verifySharedChatImageAccess', () => {
  it('throws when shared session id is empty', async () => {
    const { verifySharedChatImageAccess } = await import('./shared-chat-read-service');

    await expect(
      verifySharedChatImageAccess({
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

  it('accepts an image owned by the shared session', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([
      {
        id: 'file-1',
        userId: null,
        metadata: {
          inviteCode: 'invite',
          entityType: 'character',
          entityId: 'character-1',
          sessionId: 'session-1',
        },
      },
    ]);

    const { verifySharedChatImageAccess } = await import('./shared-chat-read-service');

    await expect(
      verifySharedChatImageAccess({
        inviteCode: 'invite',
        entityType: 'character',
        entityId: 'character-1',
        fileId: 'file-1',
        sharedSessionId: 'session-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects missing files', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([]);
    const { verifySharedChatImageAccess } = await import('./shared-chat-read-service');

    await expect(
      verifySharedChatImageAccess({
        inviteCode: 'invite',
        entityType: 'character',
        entityId: 'character-1',
        fileId: 'file-1',
        sharedSessionId: 'session-1',
      }),
    ).rejects.toThrow('File not found');
  });

  it('rejects files belonging to a user', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([
      {
        id: 'file-1',
        userId: 'user-1',
        metadata: null,
      },
    ]);
    const { verifySharedChatImageAccess } = await import('./shared-chat-read-service');

    await expect(
      verifySharedChatImageAccess({
        inviteCode: 'invite',
        entityType: 'character',
        entityId: 'character-1',
        fileId: 'file-1',
        sharedSessionId: 'session-1',
      }),
    ).rejects.toThrow('Not authorized to use one or more files');
  });

  it('rejects files from another shared session', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([
      {
        id: 'file-1',
        userId: null,
        metadata: {
          inviteCode: 'invite',
          entityType: 'character',
          entityId: 'character-1',
          sessionId: 'other-session',
        },
      },
    ]);
    const { verifySharedChatImageAccess } = await import('./shared-chat-read-service');

    await expect(
      verifySharedChatImageAccess({
        inviteCode: 'invite',
        entityType: 'character',
        entityId: 'character-1',
        fileId: 'file-1',
        sharedSessionId: 'session-1',
      }),
    ).rejects.toThrow('Not authorized to access this file');
  });
});
