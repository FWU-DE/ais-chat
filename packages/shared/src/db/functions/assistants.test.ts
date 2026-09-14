import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('..', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
    insert: mocks.insert,
  },
}));

import {
  dbGetAssistantById,
  dbGetAssistantByIdForConversation,
  dbGetAssistantByIdOrAssociatedSchool,
  dbGetAssistantsByIds,
  dbGetAssistantsByUserId,
  dbGetCommunityGpts,
  dbGetGlobalAssistantByName,
  dbGetGlobalGpts,
  dbGetGptsByAssociatedSchools,
  dbGetGptsByUser,
  dbLiftSuspensionOnAssistant,
  dbSetAssistantSuspended,
  dbUpsertAssistant,
} from './assistants';
import { NotFoundError } from '@shared/error';

function mockSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    then: (resolve: (value: unknown[]) => void) => resolve(result),
  };
  mocks.select.mockReturnValue(chain);
  return chain;
}

function mockUpdateReturning(result: unknown[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  mocks.update.mockReturnValue({ set });
  return { set, where, returning };
}

function mockInsertReturning(result: unknown[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  mocks.insert.mockReturnValue({ values });
  return { values, onConflictDoUpdate, returning };
}

describe('db assistant helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dbGetAssistantsByUserId', () => {
    it('returns the assistants owned by the user', async () => {
      const assistants = [{ id: 'assistant-1' }];
      mockSelectChain(assistants);

      const result = await dbGetAssistantsByUserId({ user: { id: 'user-1' } });

      expect(result).toBe(assistants);
    });
  });

  describe('dbGetAssistantById', () => {
    it('returns the assistant when found', async () => {
      const assistant = { id: 'assistant-1', name: 'Assistant' };
      mockSelectChain([assistant]);

      const result = await dbGetAssistantById({ assistantId: 'assistant-1' });

      expect(result).toBe(assistant);
    });

    it('throws NotFoundError when no assistant matches', async () => {
      mockSelectChain([]);

      await expect(dbGetAssistantById({ assistantId: 'missing' })).rejects.toThrow(NotFoundError);
    });
  });

  describe('dbGetAssistantByIdForConversation', () => {
    it('returns the assistant when it is linked to the conversation', async () => {
      const assistant = { id: 'assistant-1', name: 'Assistant' };
      mockSelectChain([assistant]);

      const result = await dbGetAssistantByIdForConversation({
        assistantId: 'assistant-1',
        conversationId: 'conversation-1',
        userId: 'user-1',
      });

      expect(result).toBe(assistant);
    });

    it('returns undefined when the assistant is not linked to the conversation', async () => {
      mockSelectChain([]);

      const result = await dbGetAssistantByIdForConversation({
        assistantId: 'assistant-1',
        conversationId: 'conversation-1',
        userId: 'user-1',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('dbGetAssistantsByIds', () => {
    it('returns an empty array without querying the db when given no ids', async () => {
      const result = await dbGetAssistantsByIds({ assistantIds: [] });

      expect(result).toEqual([]);
      expect(mocks.select).not.toHaveBeenCalled();
    });

    it('queries the db when given ids', async () => {
      const assistants = [{ id: 'assistant-1' }];
      mockSelectChain(assistants);

      const result = await dbGetAssistantsByIds({ assistantIds: ['assistant-1'] });

      expect(result).toBe(assistants);
    });
  });

  describe('dbGetGlobalGpts', () => {
    it('joins the template mapping when the user has a federal state', async () => {
      const assistants = [{ id: 'assistant-1' }];
      const chain = mockSelectChain(assistants);

      const result = await dbGetGlobalGpts({
        user: { id: 'user-1', schoolIds: [], federalStateId: 'federal-state-1' },
      });

      expect(result).toBe(assistants);
      expect(chain.innerJoin).toHaveBeenCalled();
    });

    it('skips the template mapping join when the user has no federal state', async () => {
      const assistants = [{ id: 'assistant-1' }];
      const chain = mockSelectChain(assistants);

      const result = await dbGetGlobalGpts({
        user: { id: 'user-1', schoolIds: [], federalStateId: undefined as unknown as string },
      });

      expect(result).toBe(assistants);
      expect(chain.innerJoin).not.toHaveBeenCalled();
    });
  });

  describe('dbGetCommunityGpts', () => {
    it('returns community assistants', async () => {
      const assistants = [{ id: 'assistant-1' }];
      mockSelectChain(assistants);

      const result = await dbGetCommunityGpts();

      expect(result).toBe(assistants);
    });
  });

  describe('dbGetGlobalAssistantByName', () => {
    it('returns the matching global assistant', async () => {
      const assistant = { id: 'assistant-1', name: 'Helper' };
      mockSelectChain([assistant]);

      const result = await dbGetGlobalAssistantByName({ name: 'Helper' });

      expect(result).toBe(assistant);
    });
  });

  describe('dbGetGptsByAssociatedSchools', () => {
    it('returns an empty array without querying the db when the user has no schools', async () => {
      const result = await dbGetGptsByAssociatedSchools({ user: { schoolIds: [] } });

      expect(result).toEqual([]);
      expect(mocks.select).not.toHaveBeenCalled();
    });

    it('queries the db when the user has schools', async () => {
      const assistants = [{ id: 'assistant-1' }];
      mockSelectChain(assistants);

      const result = await dbGetGptsByAssociatedSchools({ user: { schoolIds: ['school-1'] } });

      expect(result).toBe(assistants);
    });
  });

  describe('dbGetGptsByUser', () => {
    it('returns the private assistants owned by the user', async () => {
      const assistants = [{ id: 'assistant-1' }];
      mockSelectChain(assistants);

      const result = await dbGetGptsByUser({ user: { id: 'user-1' } });

      expect(result).toBe(assistants);
    });
  });

  describe('dbGetAssistantByIdOrAssociatedSchool', () => {
    it('returns the assistant when found for a user without schools', async () => {
      const assistant = { id: 'assistant-1' };
      mockSelectChain([assistant]);

      const result = await dbGetAssistantByIdOrAssociatedSchool({
        assistantId: 'assistant-1',
        user: { id: 'user-1', schoolIds: [] },
      });

      expect(result).toBe(assistant);
    });

    it('returns the assistant when found for a user with schools', async () => {
      const assistant = { id: 'assistant-1' };
      mockSelectChain([assistant]);

      const result = await dbGetAssistantByIdOrAssociatedSchool({
        assistantId: 'assistant-1',
        user: { id: 'user-1', schoolIds: ['school-1'] },
      });

      expect(result).toBe(assistant);
    });
  });

  describe('dbUpsertAssistant', () => {
    it('inserts the assistant and returns the refreshed record, including deleted ones', async () => {
      mockInsertReturning([{ id: 'assistant-1' }]);
      const assistant = { id: 'assistant-1' };
      mockSelectChain([assistant]);

      const result = await dbUpsertAssistant({
        assistant: { id: 'assistant-1' } as never,
      });

      expect(result).toBe(assistant);
    });

    it('throws when the insert does not return a row', async () => {
      mockInsertReturning([]);

      await expect(
        dbUpsertAssistant({ assistant: { id: 'assistant-1' } as never }),
      ).rejects.toThrow('Could not insert or update assistant');
    });
  });

  describe('dbSetAssistantSuspended', () => {
    it('suspends the assistant and returns the refreshed record', async () => {
      mockUpdateReturning([{ id: 'assistant-1' }]);
      const suspendedAssistant = { id: 'assistant-1', suspended: true };
      mockSelectChain([suspendedAssistant]);

      const result = await dbSetAssistantSuspended({ assistantId: 'assistant-1' });

      expect(result).toBe(suspendedAssistant);
    });

    it('throws NotFoundError when the assistant does not exist', async () => {
      mockUpdateReturning([]);

      await expect(dbSetAssistantSuspended({ assistantId: 'missing' })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('dbLiftSuspensionOnAssistant', () => {
    it('lifts the suspension and returns the refreshed record', async () => {
      mockUpdateReturning([{ id: 'assistant-1' }]);
      const assistant = { id: 'assistant-1', suspended: false };
      mockSelectChain([assistant]);

      const result = await dbLiftSuspensionOnAssistant({ assistantId: 'assistant-1' });

      expect(result).toBe(assistant);
    });

    it('throws NotFoundError when the assistant does not exist', async () => {
      mockUpdateReturning([]);

      await expect(dbLiftSuspensionOnAssistant({ assistantId: 'missing' })).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
