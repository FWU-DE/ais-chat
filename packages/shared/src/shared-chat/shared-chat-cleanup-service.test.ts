import { dbDeleteFilesByIds } from '@shared/db/functions/files';
import { dbDeleteExpiredSharedChatConversations } from '@shared/db/functions/shared-chat-conversation';
import { deleteMessageAttachments } from '@shared/files/fileService';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanupExpiredSharedChatFiles } from './shared-chat-cleanup-service';

vi.mock('@shared/db/functions/files', () => ({
  dbDeleteFilesByIds: vi.fn(),
}));

vi.mock('@shared/files/fileService', () => ({
  deleteMessageAttachments: vi.fn(),
}));

vi.mock('@shared/db/functions/shared-chat-conversation', () => ({
  dbDeleteExpiredSharedChatConversations: vi.fn(),
}));

const originalEnv = { ...process.env };

const NOW = new Date('2026-07-15T00:00:00Z');
const EXPECTED_CUTOFF = new Date('2026-07-14T00:00:00Z');

beforeAll(() => {
  process.env.OTC_ACCESS_KEY_ID = 'test-access-key-id';
  process.env.OTC_SECRET_ACCESS_KEY = 'test-secret-access-key';
  process.env.OTC_BUCKET_NAME = 'test-bucket-name';
  process.env.OTC_S3_HOSTNAME = 's3.test.local';
});

afterAll(() => {
  process.env = originalEnv;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  vi.mocked(dbDeleteFilesByIds).mockResolvedValue(undefined as never);
  vi.mocked(dbDeleteExpiredSharedChatConversations).mockResolvedValue({
    deletedConversations: 0,
    fileIds: [],
  });
  vi.mocked(deleteMessageAttachments).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cleanupExpiredSharedChatFiles', () => {
  it('deletes expired conversations with a cutoff of one day ago', async () => {
    await cleanupExpiredSharedChatFiles();

    expect(dbDeleteExpiredSharedChatConversations).toHaveBeenCalledWith(EXPECTED_CUTOFF);
  });

  it('returns 0 and deletes no files when no conversation expired', async () => {
    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(0);
    expect(dbDeleteFilesByIds).not.toHaveBeenCalled();
    expect(deleteMessageAttachments).not.toHaveBeenCalled();
  });

  it('deletes the files attached to expired conversations from the database and S3', async () => {
    vi.mocked(dbDeleteExpiredSharedChatConversations).mockResolvedValue({
      deletedConversations: 2,
      fileIds: ['file-1', 'file-2'],
    });

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(2);
    expect(dbDeleteFilesByIds).toHaveBeenCalledWith(['file-1', 'file-2']);
    expect(deleteMessageAttachments).toHaveBeenCalledWith(['file-1', 'file-2']);
  });

  it('does not delete files when conversations without files expired', async () => {
    vi.mocked(dbDeleteExpiredSharedChatConversations).mockResolvedValue({
      deletedConversations: 3,
      fileIds: [],
    });

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(0);
    expect(dbDeleteFilesByIds).not.toHaveBeenCalled();
  });
});
