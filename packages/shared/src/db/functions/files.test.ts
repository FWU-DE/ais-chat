import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock('..', () => ({ db: { insert: mocks.insert } }));

import { linkFilesToConversation } from './files';

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
