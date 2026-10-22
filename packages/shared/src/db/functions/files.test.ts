import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }));

vi.mock('..', () => ({ db: { insert: mocks.insert, select: mocks.select } }));

import { dbDeleteFileIfUnreferenced, dbVerifyFileOwner, linkFilesToConversation } from './files';

describe('linkFilesToConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fail when the same file is linked to one message twice', async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    mocks.insert.mockReturnValue({ values });

    await linkFilesToConversation({
      conversationId: 'conversation-id',
      conversationMessageId: 'message-id',
      fileIds: ['file-id', 'file-id'],
    });

    expect(onConflictDoNothing).toHaveBeenCalledWith({ target: expect.any(Array) });
  });
});

describe('dbVerifyFileOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when the file belongs to the user', async () => {
    const limit = vi.fn().mockResolvedValue([{ id: 'file-1' }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mocks.select.mockReturnValue({ from });

    await expect(dbVerifyFileOwner({ fileId: 'file-1', userId: 'user-1' })).resolves.toBe(true);
  });

  it('returns false when the file belongs to another user', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mocks.select.mockReturnValue({ from });

    await expect(dbVerifyFileOwner({ fileId: 'file-1', userId: 'user-1' })).resolves.toBe(false);
  });
});

describe('dbDeleteFileIfUnreferenced', () => {
  function mockTransactionDelete(result: unknown[]) {
    const returning = vi.fn().mockResolvedValue(result);
    const where = vi.fn().mockReturnValue({ returning });
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    });
    const tx = {
      delete: vi.fn().mockReturnValue({ where }),
      select,
    };
    return { tx, returning, select };
  }

  it('returns true when the unreferenced file is deleted', async () => {
    const { tx, select } = mockTransactionDelete([{ id: 'file-1' }]);

    await expect(dbDeleteFileIfUnreferenced(tx, 'file-1')).resolves.toBe(true);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(4);
  });

  it('returns false when the file is still referenced', async () => {
    const { tx } = mockTransactionDelete([]);

    await expect(dbDeleteFileIfUnreferenced(tx, 'file-1')).resolves.toBe(false);
  });
});
