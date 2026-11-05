import {
  dbDeleteFilesByIds,
  dbGetCharacterSharesByInviteCodes,
  dbGetLearningScenarioSharesByInviteCodes,
  dbGetSharedChatFileCandidates,
} from '@shared/db/functions/shared-chat-files';
import { deleteMessageAttachments } from '@shared/files/fileService';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanupExpiredSharedChatFiles } from './shared-chat-cleanup-service';

vi.mock('@shared/db/functions/shared-chat-files', () => ({
  dbGetSharedChatFileCandidates: vi.fn(),
  dbGetCharacterSharesByInviteCodes: vi.fn(),
  dbGetLearningScenarioSharesByInviteCodes: vi.fn(),
  dbDeleteFilesByIds: vi.fn(),
}));

vi.mock('@shared/files/fileService', () => ({
  deleteMessageAttachments: vi.fn(),
}));

const originalEnv = { ...process.env };

const NOW = new Date('2026-07-15T00:00:00Z');
const EXPECTED_CUTOFF = new Date('2026-07-14T00:00:00Z');
const NOT_EXPIRED = new Date('2026-08-01T00:00:00Z');
const EXPIRED = new Date('2026-07-01T00:00:00Z');
const STOPPED_RECENTLY = new Date('2026-07-14T12:00:00Z');
const STOPPED_LONG_AGO = new Date('2026-07-01T00:00:00Z');

function candidate(
  id: string,
  overrides: {
    inviteCode: string;
    entityType: 'character' | 'learningScenario';
    entityId: string;
  },
) {
  return {
    id,
    metadata: {
      sessionId: `session-${id}`,
      ...overrides,
    },
  };
}

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

  vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([]);
  vi.mocked(dbGetCharacterSharesByInviteCodes).mockResolvedValue([]);
  vi.mocked(dbGetLearningScenarioSharesByInviteCodes).mockResolvedValue([]);
  vi.mocked(dbDeleteFilesByIds).mockResolvedValue(undefined as never);
  vi.mocked(deleteMessageAttachments).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cleanupExpiredSharedChatFiles', () => {
  it('returns 0 when no files exist', async () => {
    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(0);
    expect(dbDeleteFilesByIds).not.toHaveBeenCalled();
    expect(deleteMessageAttachments).not.toHaveBeenCalled();
  });

  it('returns 0 when files have invalid metadata', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      { id: 'file-1', metadata: { invalid: 'metadata' } },
      { id: 'file-2', metadata: null },
    ]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(0);
    expect(dbGetCharacterSharesByInviteCodes).not.toHaveBeenCalled();
    expect(dbGetLearningScenarioSharesByInviteCodes).not.toHaveBeenCalled();
    expect(dbDeleteFilesByIds).not.toHaveBeenCalled();
  });

  it('deletes files from expired character shares', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      candidate('file-1', {
        inviteCode: 'invite-1',
        entityType: 'character',
        entityId: 'character-1',
      }),
    ]);
    vi.mocked(dbGetCharacterSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-1',
        entityId: 'character-1',
        expiredAt: EXPIRED,
        manuallyStoppedAt: null,
      },
    ]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(1);
    expect(dbDeleteFilesByIds).toHaveBeenCalledWith(['file-1']);
    expect(deleteMessageAttachments).toHaveBeenCalledWith(['file-1']);
  });

  it('deletes files from expired learning scenario shares', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      candidate('file-2', {
        inviteCode: 'invite-2',
        entityType: 'learningScenario',
        entityId: 'scenario-1',
      }),
    ]);
    vi.mocked(dbGetLearningScenarioSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-2',
        entityId: 'scenario-1',
        expiredAt: EXPIRED,
        manuallyStoppedAt: null,
      },
    ]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(1);
    expect(dbDeleteFilesByIds).toHaveBeenCalledWith(['file-2']);
    expect(deleteMessageAttachments).toHaveBeenCalledWith(['file-2']);
  });

  it('deletes files whose share was cascade-deleted along with its entity', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      candidate('file-1', {
        inviteCode: 'invite-1',
        entityType: 'character',
        entityId: 'character-1',
      }),
    ]);
    // No share is returned for 'invite-1' — it was deleted along with the character.
    vi.mocked(dbGetCharacterSharesByInviteCodes).mockResolvedValue([]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(1);
    expect(dbDeleteFilesByIds).toHaveBeenCalledWith(['file-1']);
  });

  it('deletes multiple files from both character and scenario shares', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      candidate('file-1', {
        inviteCode: 'invite-1',
        entityType: 'character',
        entityId: 'character-1',
      }),
      candidate('file-2', {
        inviteCode: 'invite-2',
        entityType: 'character',
        entityId: 'character-2',
      }),
      candidate('file-3', {
        inviteCode: 'invite-3',
        entityType: 'learningScenario',
        entityId: 'scenario-1',
      }),
      candidate('file-4', {
        inviteCode: 'invite-4',
        entityType: 'learningScenario',
        entityId: 'scenario-2',
      }),
    ]);
    vi.mocked(dbGetCharacterSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-1',
        entityId: 'character-1',
        expiredAt: EXPIRED,
        manuallyStoppedAt: null,
      },
      {
        inviteCode: 'invite-2',
        entityId: 'character-2',
        expiredAt: EXPIRED,
        manuallyStoppedAt: null,
      },
    ]);
    vi.mocked(dbGetLearningScenarioSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-3',
        entityId: 'scenario-1',
        expiredAt: EXPIRED,
        manuallyStoppedAt: null,
      },
      {
        inviteCode: 'invite-4',
        entityId: 'scenario-2',
        expiredAt: EXPIRED,
        manuallyStoppedAt: null,
      },
    ]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(4);
    expect(dbDeleteFilesByIds).toHaveBeenCalledWith(['file-1', 'file-2', 'file-3', 'file-4']);
  });

  it('does not delete files whose share still exists and has not expired', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      candidate('file-1', {
        inviteCode: 'invite-1',
        entityType: 'character',
        entityId: 'character-1',
      }),
    ]);
    vi.mocked(dbGetCharacterSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-1',
        entityId: 'character-1',
        expiredAt: NOT_EXPIRED,
        manuallyStoppedAt: null,
      },
    ]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(0);
    expect(dbDeleteFilesByIds).not.toHaveBeenCalled();
  });

  it('does not delete files from a share manually stopped within the safety buffer', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      candidate('file-1', {
        inviteCode: 'invite-1',
        entityType: 'character',
        entityId: 'character-1',
      }),
    ]);
    vi.mocked(dbGetCharacterSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-1',
        entityId: 'character-1',
        expiredAt: NOT_EXPIRED,
        manuallyStoppedAt: STOPPED_RECENTLY,
      },
    ]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(0);
    expect(dbDeleteFilesByIds).not.toHaveBeenCalled();
  });

  it('deletes files from a share manually stopped before the safety buffer, even if not yet expired', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      candidate('file-1', {
        inviteCode: 'invite-1',
        entityType: 'character',
        entityId: 'character-1',
      }),
    ]);
    vi.mocked(dbGetCharacterSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-1',
        entityId: 'character-1',
        expiredAt: NOT_EXPIRED,
        manuallyStoppedAt: STOPPED_LONG_AGO,
      },
    ]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(1);
    expect(dbDeleteFilesByIds).toHaveBeenCalledWith(['file-1']);
  });

  it('handles mixed active and expired shares correctly', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      candidate('file-1', {
        inviteCode: 'invite-1',
        entityType: 'character',
        entityId: 'character-1',
      }),
      candidate('file-2', {
        inviteCode: 'invite-2',
        entityType: 'character',
        entityId: 'character-2',
      }),
    ]);
    vi.mocked(dbGetCharacterSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-1',
        entityId: 'character-1',
        expiredAt: EXPIRED,
        manuallyStoppedAt: null,
      },
      {
        inviteCode: 'invite-2',
        entityId: 'character-2',
        expiredAt: NOT_EXPIRED,
        manuallyStoppedAt: null,
      },
    ]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(1);
    expect(dbDeleteFilesByIds).toHaveBeenCalledWith(['file-1']);
  });

  it('is still active exactly at the reference date boundary (grace window not yet elapsed)', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      candidate('file-1', {
        inviteCode: 'invite-1',
        entityType: 'character',
        entityId: 'character-1',
      }),
    ]);
    vi.mocked(dbGetCharacterSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-1',
        entityId: 'character-1',
        expiredAt: EXPECTED_CUTOFF,
        manuallyStoppedAt: null,
      },
    ]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(dbGetCharacterSharesByInviteCodes).toHaveBeenCalledWith(['invite-1']);
    expect(dbGetLearningScenarioSharesByInviteCodes).toHaveBeenCalledWith([]);
    // A share expiring exactly at the cutoff date is not yet considered expired.
    expect(result).toBe(0);
  });

  it('skips files with invalid metadata format', async () => {
    vi.mocked(dbGetSharedChatFileCandidates).mockResolvedValue([
      candidate('file-1', {
        inviteCode: 'invite-1',
        entityType: 'character',
        entityId: 'character-1',
      }),
      { id: 'file-2', metadata: { incomplete: 'data' } },
      candidate('file-3', {
        inviteCode: 'invite-3',
        entityType: 'learningScenario',
        entityId: 'scenario-1',
      }),
    ]);
    vi.mocked(dbGetCharacterSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-1',
        entityId: 'character-1',
        expiredAt: EXPIRED,
        manuallyStoppedAt: null,
      },
    ]);
    vi.mocked(dbGetLearningScenarioSharesByInviteCodes).mockResolvedValue([
      {
        inviteCode: 'invite-3',
        entityId: 'scenario-1',
        expiredAt: EXPIRED,
        manuallyStoppedAt: null,
      },
    ]);

    const result = await cleanupExpiredSharedChatFiles();

    expect(result).toBe(2);
    expect(dbDeleteFilesByIds).toHaveBeenCalledWith(['file-1', 'file-3']);
  });
});
