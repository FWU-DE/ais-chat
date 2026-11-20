import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('..', () => ({
  db: {
    insert: mocks.insert,
    update: mocks.update,
  },
}));

vi.mock('../../logging/logging', () => ({
  logError: mocks.logError,
}));

import type { InsertConversationMessageModel } from '../types';
import {
  dbDeleteRegeneratedConversationMessage,
  dbInsertChatContent,
  dbInsertChatContentBatch,
} from './chat';

function createMessage(overrides: Partial<InsertConversationMessageModel> = {}) {
  return {
    id: 'msg-1',
    content: 'hello',
    conversationId: 'conv-1',
    modelName: 'model-1',
    userId: 'user-1',
    role: 'assistant',
    orderNumber: 1,
    ...overrides,
  } as InsertConversationMessageModel;
}

describe('chat db functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft deletes regenerated messages', async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    mocks.update.mockReturnValue({ set: setMock });

    await dbDeleteRegeneratedConversationMessage({
      conversationId: 'conv-1',
      orderNumber: 5,
    });

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: ' ',
        deletedAt: expect.any(Date),
      }),
    );
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it('logs conflicts for single inserts that were skipped', async () => {
    const message = createMessage();
    const returningMock = vi.fn().mockResolvedValue([]);
    const onConflictDoNothingMock = vi.fn().mockReturnValue({ returning: returningMock });
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });

    mocks.insert.mockReturnValue({ values: valuesMock });

    const result = await dbInsertChatContent(message);

    expect(result).toBeUndefined();
    expect(mocks.logError).toHaveBeenCalledWith(
      'Skipped conversation message insert due to conflict.',
      undefined,
      {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        orderNumber: 1,
        role: 'assistant',
        userId: 'user-1',
      },
    );
  });

  it('logs skipped messages for batch insert conflicts', async () => {
    const firstMessage = createMessage({ id: 'msg-1', orderNumber: 1 });
    const secondMessage = createMessage({ id: 'msg-2', orderNumber: 2 });
    const returningMock = vi
      .fn()
      .mockResolvedValue([{ id: 'msg-1', conversationId: 'conv-1', orderNumber: 1 }]);
    const onConflictDoNothingMock = vi.fn().mockReturnValue({ returning: returningMock });
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });

    mocks.insert.mockReturnValue({ values: valuesMock });

    await dbInsertChatContentBatch([firstMessage, secondMessage]);

    expect(mocks.logError).toHaveBeenCalledWith(
      'Skipped conversation message batch inserts due to conflict.',
      undefined,
      {
        totalSkipped: 1,
        skippedMessages: [
          {
            conversationId: 'conv-1',
            messageId: 'msg-2',
            orderNumber: 2,
            role: 'assistant',
            userId: 'user-1',
          },
        ],
      },
    );
  });
});

describe('conversation message order number uniqueness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips and logs a duplicate order number conflict for dbInsertChatContent', async () => {
    const firstMessage = createMessage({ id: 'msg-1', conversationId: 'conv-1', orderNumber: 3 });
    const duplicateMessage = createMessage({
      id: 'msg-2',
      conversationId: 'conv-1',
      orderNumber: 3,
    });

    const returningMock = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'msg-1' }])
      .mockResolvedValueOnce([]);
    const onConflictDoNothingMock = vi.fn().mockReturnValue({ returning: returningMock });
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });
    mocks.insert.mockReturnValue({ values: valuesMock });

    const firstInsert = await dbInsertChatContent(firstMessage);
    const secondInsert = await dbInsertChatContent(duplicateMessage);

    expect(firstInsert).toEqual({ id: 'msg-1' });
    expect(secondInsert).toBeUndefined();
    expect(mocks.logError).toHaveBeenCalledWith(
      'Skipped conversation message insert due to conflict.',
      undefined,
      {
        conversationId: 'conv-1',
        messageId: 'msg-2',
        orderNumber: 3,
        role: 'assistant',
        userId: 'user-1',
      },
    );
  });

  it('skips and logs duplicate order number conflicts for dbInsertChatContentBatch', async () => {
    const firstMessage = createMessage({ id: 'msg-1', conversationId: 'conv-1', orderNumber: 7 });
    const duplicateMessage = createMessage({
      id: 'msg-2',
      conversationId: 'conv-1',
      orderNumber: 7,
    });

    const returningMock = vi
      .fn()
      .mockResolvedValue([{ id: 'msg-1', conversationId: 'conv-1', orderNumber: 7 }]);
    const onConflictDoNothingMock = vi.fn().mockReturnValue({ returning: returningMock });
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });
    mocks.insert.mockReturnValue({ values: valuesMock });

    await dbInsertChatContentBatch([firstMessage, duplicateMessage]);

    expect(mocks.logError).toHaveBeenCalledWith(
      'Skipped conversation message batch inserts due to conflict.',
      undefined,
      {
        totalSkipped: 1,
        skippedMessages: [
          {
            conversationId: 'conv-1',
            messageId: 'msg-2',
            orderNumber: 7,
            role: 'assistant',
            userId: 'user-1',
          },
        ],
      },
    );
  });

  it('logs batch conflicts when messages lack explicit IDs', async () => {
    const messageWithId = createMessage({ id: 'msg-1', orderNumber: 1 });
    const messageWithoutId = createMessage({ id: undefined, orderNumber: 2 });
    const anotherWithoutId = createMessage({ id: undefined, orderNumber: 3 });

    const returningMock = vi
      .fn()
      .mockResolvedValue([{ id: 'msg-1', conversationId: 'conv-1', orderNumber: 1 }]);
    const onConflictDoNothingMock = vi.fn().mockReturnValue({ returning: returningMock });
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });

    mocks.insert.mockReturnValue({ values: valuesMock });

    await dbInsertChatContentBatch([messageWithId, messageWithoutId, anotherWithoutId]);

    // Now can precisely identify skipped messages even without explicit IDs (via conversationId + orderNumber)
    expect(mocks.logError).toHaveBeenCalledWith(
      'Skipped conversation message batch inserts due to conflict.',
      undefined,
      {
        totalSkipped: 2,
        skippedMessages: [
          {
            conversationId: 'conv-1',
            messageId: undefined,
            orderNumber: 2,
            role: 'assistant',
            userId: 'user-1',
          },
          {
            conversationId: 'conv-1',
            messageId: undefined,
            orderNumber: 3,
            role: 'assistant',
            userId: 'user-1',
          },
        ],
      },
    );
  });
});
