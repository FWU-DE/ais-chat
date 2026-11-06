import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSharedChatEntityMock: vi.fn(),
  dbGetFilesInIdsMock: vi.fn(),
  dbGetSharedChatConversationMock: vi.fn(),
  dbGetSharedChatFileConversationIdsMock: vi.fn(),
}));

vi.mock('./shared-chat-get-entity', () => ({
  getSharedChatEntity: mocks.getSharedChatEntityMock,
}));

vi.mock('@shared/db/functions/files', () => ({
  dbGetFilesInIds: mocks.dbGetFilesInIdsMock,
}));

vi.mock('@shared/db/functions/shared-chat-conversation', () => ({
  dbGetSharedChatConversation: mocks.dbGetSharedChatConversationMock,
  dbGetSharedChatFileConversationIds: mocks.dbGetSharedChatFileConversationIdsMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbGetSharedChatConversationMock.mockResolvedValue({ id: 'session-1' });
  mocks.dbGetSharedChatFileConversationIdsMock.mockResolvedValue([
    { fileId: 'file-1', conversationId: 'session-1' },
  ]);
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

  it('accepts an image mapped to the conversation', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([{ id: 'file-1', userId: null, metadata: {} }]);

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

  it('rejects files mapped to another conversation', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([{ id: 'file-1', userId: null, metadata: {} }]);
    mocks.dbGetSharedChatFileConversationIdsMock.mockResolvedValue([
      { fileId: 'file-1', conversationId: 'other-session' },
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

  it('rejects when the conversation does not belong to the invite', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([{ id: 'file-1', userId: null, metadata: {} }]);
    mocks.dbGetSharedChatConversationMock.mockResolvedValue(undefined);
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
