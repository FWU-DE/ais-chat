import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbGetFilesInIdsMock: vi.fn(),
  dbGetSharedChatFileConversationIdsMock: vi.fn(),
}));

vi.mock('@shared/db/functions/files', () => ({
  dbGetFilesInIds: mocks.dbGetFilesInIdsMock,
}));

vi.mock('@shared/db/functions/shared-chat-conversation', () => ({
  dbGetSharedChatFileConversationIds: mocks.dbGetSharedChatFileConversationIdsMock,
}));

const relatedFile = {
  id: 'related-file',
  name: 'context.pdf',
  type: 'pdf',
  size: 10,
  createdAt: new Date('2026-01-01'),
  metadata: null,
  userId: null,
};

const uploadedFile = {
  id: 'uploaded-file',
  name: 'photo.png',
  type: 'png',
  size: 11,
  createdAt: new Date('2026-01-02'),
  metadata: {},
  userId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbGetSharedChatFileConversationIdsMock.mockResolvedValue([
    { fileId: 'uploaded-file', conversationId: 'session-1' },
  ]);
});

describe('combineSharedRelatedFiles', () => {
  it('returns related files unchanged when no fileIds are provided', async () => {
    const { combineSharedRelatedFiles } = await import('./shared-chat-file-service');

    const result = await combineSharedRelatedFiles({
      relatedFileEntities: [relatedFile],
      fileIds: undefined,
      sharedSessionId: 'session-1',
    });

    expect(result).toEqual([relatedFile]);
    expect(mocks.dbGetFilesInIdsMock).not.toHaveBeenCalled();
  });

  it('throws when sharedSessionId is missing for uploaded files', async () => {
    const { combineSharedRelatedFiles } = await import('./shared-chat-file-service');

    await expect(
      combineSharedRelatedFiles({
        relatedFileEntities: [relatedFile],
        fileIds: ['uploaded-file'],
      }),
    ).rejects.toThrow('Not authorized to use uploaded files');

    expect(mocks.dbGetFilesInIdsMock).not.toHaveBeenCalled();
  });

  it('associates uploaded files with the latest user message id', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([uploadedFile]);
    const { combineSharedRelatedFiles } = await import('./shared-chat-file-service');

    const result = await combineSharedRelatedFiles({
      relatedFileEntities: [relatedFile],
      fileIds: ['uploaded-file'],
      sharedSessionId: 'session-1',
      userMessageId: 'user-message-1',
    });

    expect(mocks.dbGetFilesInIdsMock).toHaveBeenCalledWith(['uploaded-file']);
    expect(result).toEqual([
      relatedFile,
      { ...uploadedFile, conversationMessageId: 'user-message-1' },
    ]);
  });

  it('returns related files combined with uploaded files when fileIds are provided', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([uploadedFile]);
    const { combineSharedRelatedFiles } = await import('./shared-chat-file-service');

    const result = await combineSharedRelatedFiles({
      relatedFileEntities: [relatedFile],
      fileIds: ['uploaded-file'],
      sharedSessionId: 'session-1',
      userMessageId: 'user-message-1',
    });

    expect(result).toEqual([
      relatedFile,
      { ...uploadedFile, conversationMessageId: 'user-message-1' },
    ]);
  });

  it('throws when uploaded file is mapped to another conversation', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([uploadedFile]);
    mocks.dbGetSharedChatFileConversationIdsMock.mockResolvedValue([
      { fileId: 'uploaded-file', conversationId: 'session-other' },
    ]);

    const { combineSharedRelatedFiles } = await import('./shared-chat-file-service');

    await expect(
      combineSharedRelatedFiles({
        relatedFileEntities: [relatedFile],
        fileIds: ['uploaded-file'],
        sharedSessionId: 'session-1',
      }),
    ).rejects.toThrow('Not authorized to access this file');
  });

  it('throws when uploaded file is not mapped to any conversation', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([uploadedFile]);
    mocks.dbGetSharedChatFileConversationIdsMock.mockResolvedValue([]);

    const { combineSharedRelatedFiles } = await import('./shared-chat-file-service');

    await expect(
      combineSharedRelatedFiles({
        relatedFileEntities: [relatedFile],
        fileIds: ['uploaded-file'],
        sharedSessionId: 'session-1',
      }),
    ).rejects.toThrow('Not authorized to access this file');
  });
});
