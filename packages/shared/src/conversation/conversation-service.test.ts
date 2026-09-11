import { beforeEach, describe, expect, it, MockedFunction, vi } from 'vitest';
import {
  getConversation,
  getConversationAndMessagesForExport,
  getConversationMessageForExport,
  getConversationMessages,
} from './conversation-service';
import { ForbiddenError, NotFoundError } from '@shared/error';
import { generateUUID } from '@shared/utils/uuid';
import {
  dbGetConversationById,
  dbGetConversationMessageById,
  dbGetConversationMessages,
} from '@shared/db/functions/chat';
import { dbGetCharacterById } from '@shared/db/functions/character';
import { dbGetRelatedFiles } from '@shared/db/functions/files';
import { ConversationModel } from '@shared/db/types';

vi.mock('../db/functions/chat', () => ({
  dbGetConversationById: vi.fn(),
  dbGetConversationMessageById: vi.fn(),
  dbGetConversationMessages: vi.fn(),
}));

vi.mock('@shared/db/functions/character', () => ({
  dbGetCharacterById: vi.fn(),
}));

vi.mock('@shared/db/functions/files', () => ({
  dbGetRelatedFiles: vi.fn(),
}));

describe('conversation-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      dbGetConversationMessageById as MockedFunction<typeof dbGetConversationMessageById>
    ).mockResolvedValue(undefined);
    (dbGetRelatedFiles as MockedFunction<typeof dbGetRelatedFiles>).mockResolvedValue(new Map());
  });

  describe('getConversation', () => {
    it('should throw because conversation not found', async () => {
      const userId = generateUUID();
      const conversationId = generateUUID();

      (dbGetConversationById as MockedFunction<typeof dbGetConversationById>).mockResolvedValue(
        null as never,
      );

      await expect(
        getConversation({
          conversationId,
          userId,
        }),
      ).rejects.toThrowError(NotFoundError);
    });

    it('should throw because user is not owner of conversation', async () => {
      const userId = generateUUID();
      const conversationId = generateUUID();
      const mockConversation: Partial<ConversationModel> = {
        id: conversationId,
        userId: 'differentUserId',
      };

      (dbGetConversationById as MockedFunction<typeof dbGetConversationById>).mockResolvedValue(
        mockConversation as never,
      );

      await expect(
        getConversation({
          conversationId,
          userId,
        }),
      ).rejects.toThrowError(ForbiddenError);
    });
  });

  describe('getConversationMessages', () => {
    it('should call dbGetConversationMessages with correct parameters', async () => {
      const userId = generateUUID();
      const conversationId = generateUUID();
      const mockMessages: unknown[] = [];

      (
        dbGetConversationMessages as MockedFunction<typeof dbGetConversationMessages>
      ).mockResolvedValue(mockMessages as never);

      await getConversationMessages({
        conversationId,
        userId,
      });

      // we rely on this function to only return messages for the given user
      expect(dbGetConversationMessages).toHaveBeenCalledWith({
        conversationId,
        userId,
      });
    });

    it('should throw when database function rejects', async () => {
      const userId = generateUUID();
      const conversationId = generateUUID();

      (
        dbGetConversationMessages as MockedFunction<typeof dbGetConversationMessages>
      ).mockRejectedValue(new NotFoundError('Messages not found'));

      await expect(
        getConversationMessages({
          conversationId,
          userId,
        }),
      ).rejects.toThrowError(NotFoundError);
    });
  });

  describe('getConversationAndMessagesForExport', () => {
    it('should exclude tool result messages from export', async () => {
      const userId = generateUUID();
      const conversationId = generateUUID();

      (dbGetConversationById as MockedFunction<typeof dbGetConversationById>).mockResolvedValue({
        id: conversationId,
        userId,
        characterId: null,
      } as ConversationModel);

      (
        dbGetConversationMessages as MockedFunction<typeof dbGetConversationMessages>
      ).mockResolvedValue([
        {
          id: generateUUID(),
          role: 'user',
          content: 'Hallo',
          toolCallId: null,
        },
        {
          id: generateUUID(),
          role: 'assistant',
          content: 'Ich suche das fuer dich.',
          toolCallId: null,
        },
        {
          id: generateUUID(),
          role: 'tool',
          content: '{"chunks":[],"error":"No matching chunks found."}',
          toolCallId: 'call-1',
        },
        {
          id: generateUUID(),
          role: 'assistant',
          content: 'Hier ist meine Antwort.',
          toolCallId: null,
        },
      ] as never);

      const result = await getConversationAndMessagesForExport({ conversationId, userId });

      expect(result.messages.map((message) => message.role)).toEqual([
        'user',
        'assistant',
        'assistant',
      ]);
      expect(result.messages.some((message) => message.role === 'tool')).toBe(false);
    });

    it('prepends the character initial message and includes soft-deleted characters', async () => {
      const userId = generateUUID();
      const conversationId = generateUUID();
      const characterId = generateUUID();

      (dbGetConversationById as MockedFunction<typeof dbGetConversationById>).mockResolvedValue({
        id: conversationId,
        userId,
        characterId,
      } as ConversationModel);
      (
        dbGetConversationMessages as MockedFunction<typeof dbGetConversationMessages>
      ).mockResolvedValue([
        {
          id: generateUUID(),
          role: 'user',
          content: 'Hallo',
          toolCallId: null,
        },
      ] as never);
      (dbGetCharacterById as MockedFunction<typeof dbGetCharacterById>).mockResolvedValue({
        initialMessage: 'Willkommen!',
      } as never);

      const result = await getConversationAndMessagesForExport({ conversationId, userId });

      expect(dbGetCharacterById).toHaveBeenCalledWith({ characterId, includeDeleted: true });
      expect(result.messages.map((message) => message.content)).toEqual(['Willkommen!', 'Hallo']);
    });
  });

  describe('getConversationMessageForExport', () => {
    it('should reject tool result messages', async () => {
      const userId = generateUUID();
      const conversationId = generateUUID();
      const messageId = generateUUID();

      (dbGetConversationById as MockedFunction<typeof dbGetConversationById>).mockResolvedValue({
        id: conversationId,
        userId,
      } as ConversationModel);

      (
        dbGetConversationMessageById as MockedFunction<typeof dbGetConversationMessageById>
      ).mockResolvedValue({
        id: messageId,
        role: 'tool',
        content: '{"chunks":[],"error":"No matching chunks found."}',
        toolCallId: 'call-1',
      } as never);

      await expect(
        getConversationMessageForExport({ conversationId, messageId, userId }),
      ).rejects.toThrowError(NotFoundError);
    });
  });
});
