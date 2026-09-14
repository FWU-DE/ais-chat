import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  selectDistinctOn: vi.fn(),
  update: vi.fn(),
}));

vi.mock('..', () => ({
  db: {
    select: mocks.select,
    selectDistinctOn: mocks.selectDistinctOn,
    update: mocks.update,
  },
}));

import {
  dbExtendSharedCharacterConversationExpiration,
  dbGetAllAccessibleCharacters,
  dbGetAllCharactersByUser,
  dbGetCharacterById,
  dbGetCharacterByIdAndUser,
  dbGetCharacterByIdAndInviteCode,
  dbGetCharacterByIdForConversation,
  dbGetCharacterByIdOptionalShareData,
  dbGetCharacterByIdWithShareData,
  dbGetCharacterByNameAndUser,
  dbGetCharacters,
  dbGetCharactersByAssociatedSchools,
  dbGetCharactersByIds,
  dbGetCharactersByUser,
  dbGetCommunityCharacters,
  dbGetGlobalCharacterByName,
  dbGetGlobalCharacters,
  dbLiftSuspensionOnCharacter,
  dbSetCharacterSuspended,
  dbUpdateCharacterShareTokenPointsLimit,
} from './character';
import { NotFoundError } from '@shared/error';

function mockSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    then: (resolve: (value: unknown[]) => void) => resolve(result),
  };
  mocks.select.mockReturnValue(chain);
  return chain;
}

// Character queries that surface share data build a `latestActiveCharacterShare`
// subquery via `db.selectDistinctOn(...).as(...)`; its contents are irrelevant here.
function mockShareSubquery() {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.as = vi.fn(() => ({}));
  mocks.selectDistinctOn.mockReturnValue(chain);
}

function mockSelectLatestShare(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  mocks.select.mockReturnValue({ from });
  return { from, where, orderBy, limit };
}

function mockUpdateReturning(result: unknown[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  mocks.update.mockReturnValue({ set });
  return { set, where, returning };
}

describe('db character sharing helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('character read queries', () => {
    beforeEach(() => {
      mockShareSubquery();
    });

    it('dbGetCharacters returns accessible characters', async () => {
      const characters = [{ id: 'character-1' }];
      mockSelectChain(characters);

      const result = await dbGetCharacters({ user: { id: 'user-1', schoolIds: [] } });

      expect(result).toBe(characters);
    });

    it('dbGetCharacterById returns the character when found', async () => {
      const character = { id: 'character-1' };
      mockSelectChain([character]);

      const result = await dbGetCharacterById({ characterId: 'character-1' });

      expect(result).toBe(character);
    });

    it('dbGetCharacterByIdForConversation returns the character when linked to the conversation', async () => {
      const character = { id: 'character-1' };
      mockSelectChain([character]);

      const result = await dbGetCharacterByIdForConversation({
        characterId: 'character-1',
        conversationId: 'conversation-1',
        userId: 'user-1',
      });

      expect(result).toBe(character);
    });

    it('dbGetCharacterByIdForConversation returns undefined when not linked to the conversation', async () => {
      mockSelectChain([]);

      const result = await dbGetCharacterByIdForConversation({
        characterId: 'character-1',
        conversationId: 'conversation-1',
        userId: 'user-1',
      });

      expect(result).toBeUndefined();
    });

    it('dbGetCharactersByIds returns an empty array without querying the db when given no ids', async () => {
      const result = await dbGetCharactersByIds({ characterIds: [] });

      expect(result).toEqual([]);
      expect(mocks.select).not.toHaveBeenCalled();
    });

    it('dbGetCharactersByIds queries the db when given ids', async () => {
      const characters = [{ id: 'character-1' }];
      mockSelectChain(characters);

      const result = await dbGetCharactersByIds({ characterIds: ['character-1'] });

      expect(result).toBe(characters);
    });

    it('dbGetCharacterByIdAndInviteCode returns the matching row', async () => {
      const row = { id: 'character-1' };
      mockSelectChain([row]);

      const result = await dbGetCharacterByIdAndInviteCode({
        id: 'character-1',
        inviteCode: 'invite-1',
      });

      expect(result).toBe(row);
    });

    it('dbGetCharacterByIdWithShareData returns the matching row', async () => {
      const row = { id: 'character-1' };
      mockSelectChain([row]);

      const result = await dbGetCharacterByIdWithShareData({
        characterId: 'character-1',
        user: { id: 'user-1' },
      });

      expect(result).toBe(row);
    });

    it('dbGetCharacterByIdOptionalShareData returns the matching row', async () => {
      const row = { id: 'character-1' };
      mockSelectChain([row]);

      const result = await dbGetCharacterByIdOptionalShareData({
        characterId: 'character-1',
        user: { id: 'user-1' },
      });

      expect(result).toBe(row);
    });

    it('dbGetCharacterByIdAndUser returns the matching row', async () => {
      const row = { id: 'character-1' };
      mockSelectChain([row]);

      const result = await dbGetCharacterByIdAndUser({
        characterId: 'character-1',
        user: { id: 'user-1' },
      });

      expect(result).toBe(row);
    });

    it('dbGetGlobalCharacters joins the template mapping when the user has a federal state', async () => {
      const characters = [{ id: 'character-1' }];
      const chain = mockSelectChain(characters);

      const result = await dbGetGlobalCharacters({
        user: { id: 'user-1', federalStateId: 'federal-state-1' },
      });

      expect(result).toBe(characters);
      expect(chain.innerJoin).toHaveBeenCalled();
    });

    it('dbGetCommunityCharacters returns community characters', async () => {
      const characters = [{ id: 'character-1' }];
      mockSelectChain(characters);

      const result = await dbGetCommunityCharacters({ user: { id: 'user-1' } });

      expect(result).toBe(characters);
    });

    it('dbGetCharactersByAssociatedSchools returns an empty array without querying the db when the user has no schools', async () => {
      const result = await dbGetCharactersByAssociatedSchools({
        user: { id: 'user-1', schoolIds: [] },
      });

      expect(result).toEqual([]);
      expect(mocks.select).not.toHaveBeenCalled();
    });

    it('dbGetCharactersByAssociatedSchools queries the db when the user has schools', async () => {
      const characters = [{ id: 'character-1' }];
      mockSelectChain(characters);

      const result = await dbGetCharactersByAssociatedSchools({
        user: { id: 'user-1', schoolIds: ['school-1'] },
      });

      expect(result).toBe(characters);
    });

    it('dbGetCharactersByUser returns the private characters owned by the user', async () => {
      const characters = [{ id: 'character-1' }];
      mockSelectChain(characters);

      const result = await dbGetCharactersByUser({ user: { id: 'user-1' } });

      expect(result).toBe(characters);
    });

    it('dbGetAllCharactersByUser returns all characters owned by the user', async () => {
      const characters = [{ id: 'character-1' }];
      mockSelectChain(characters);

      const result = await dbGetAllCharactersByUser({ user: { id: 'user-1' } });

      expect(result).toBe(characters);
    });

    it('dbGetAllAccessibleCharacters returns all accessible characters', async () => {
      const characters = [{ id: 'character-1' }];
      mockSelectChain(characters);

      const result = await dbGetAllAccessibleCharacters({
        user: { id: 'user-1', schoolIds: [], federalStateId: 'federal-state-1' },
      });

      expect(result).toBe(characters);
    });

    it('dbGetCharacterByNameAndUser returns the matching character', async () => {
      const character = { id: 'character-1', name: 'Buddy' };
      mockSelectChain([character]);

      const result = await dbGetCharacterByNameAndUser({
        name: 'Buddy',
        user: { id: 'user-1' },
      });

      expect(result).toBe(character);
    });

    it('dbGetGlobalCharacterByName returns the matching global character', async () => {
      const character = { id: 'character-1', name: 'Buddy' };
      mockSelectChain([character]);

      const result = await dbGetGlobalCharacterByName({ name: 'Buddy' });

      expect(result).toBe(character);
    });
  });

  describe('dbSetCharacterSuspended', () => {
    it('suspends the character and returns the refreshed record, including deleted ones', async () => {
      mockUpdateReturning([{ id: 'character-1' }]);
      const suspendedCharacter = { id: 'character-1', suspended: true };
      mockSelectChain([suspendedCharacter]);

      const result = await dbSetCharacterSuspended({ characterId: 'character-1' });

      expect(result).toBe(suspendedCharacter);
    });

    it('throws NotFoundError when the character does not exist', async () => {
      mockUpdateReturning([]);

      await expect(dbSetCharacterSuspended({ characterId: 'missing' })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError when the refreshed record cannot be found after updating', async () => {
      mockUpdateReturning([{ id: 'character-1' }]);
      mockSelectChain([]);

      await expect(dbSetCharacterSuspended({ characterId: 'character-1' })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('dbLiftSuspensionOnCharacter', () => {
    it('lifts the suspension and returns the refreshed record, including deleted ones', async () => {
      mockUpdateReturning([{ id: 'character-1' }]);
      const character = { id: 'character-1', suspended: false };
      mockSelectChain([character]);

      const result = await dbLiftSuspensionOnCharacter({ characterId: 'character-1' });

      expect(result).toBe(character);
    });

    it('throws NotFoundError when the character does not exist', async () => {
      mockUpdateReturning([]);

      await expect(dbLiftSuspensionOnCharacter({ characterId: 'missing' })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError when the refreshed record cannot be found after updating', async () => {
      mockUpdateReturning([{ id: 'character-1' }]);
      mockSelectChain([]);

      await expect(dbLiftSuspensionOnCharacter({ characterId: 'character-1' })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('dbExtendSharedCharacterConversationExpiration', () => {
    it('extends from now when the loaded share is already expired', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

      const currentShare = {
        id: 'share-1',
        expiredAt: new Date('2026-01-01T10:30:00.000Z'),
      };
      const update = mockUpdateReturning([]);

      const result = await dbExtendSharedCharacterConversationExpiration({
        share: currentShare,
        additionalTimeInMinutes: 30,
      });

      expect(update.set).toHaveBeenCalledWith({
        expiredAt: new Date('2026-01-01T11:00:00.000Z'),
      });
      expect(result).toBeNull();
    });

    it('extends from current expiration when expiration is in the future', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

      const latestShare = {
        id: 'share-1',
        expiredAt: new Date('2026-01-01T10:30:00.000Z'),
      };
      const update = mockUpdateReturning([{ ...latestShare, expiredAt: new Date() }]);

      await dbExtendSharedCharacterConversationExpiration({
        share: latestShare,
        additionalTimeInMinutes: 15,
      });

      expect(update.set).toHaveBeenCalledWith({
        expiredAt: new Date('2026-01-01T10:45:00.000Z'),
      });
    });

    it('extends from now when the existing expiration is already in the past', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

      const latestShare = {
        id: 'share-1',
        expiredAt: new Date('2026-01-01T09:30:00.000Z'),
      };
      const update = mockUpdateReturning([{ ...latestShare, expiredAt: new Date() }]);

      await dbExtendSharedCharacterConversationExpiration({
        share: latestShare,
        additionalTimeInMinutes: 20,
      });

      expect(update.set).toHaveBeenCalledWith({
        expiredAt: new Date('2026-01-01T10:20:00.000Z'),
      });
    });
  });

  describe('dbUpdateCharacterShareTokenPointsLimit', () => {
    it('returns null when there is no active unstopped share', async () => {
      mockSelectLatestShare([]);

      const result = await dbUpdateCharacterShareTokenPointsLimit({
        characterId: 'character-1',
        user: { id: 'teacher-1' },
        tokenPointsLimit: 75,
      });

      expect(result).toBeNull();
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('updates token points limit for latest active share', async () => {
      const latestShare = {
        id: 'share-1',
        tokenPointsLimit: 50,
      };
      const updatedShare = {
        ...latestShare,
        tokenPointsLimit: 80,
      };
      mockSelectLatestShare([latestShare]);
      const update = mockUpdateReturning([updatedShare]);

      const result = await dbUpdateCharacterShareTokenPointsLimit({
        characterId: 'character-1',
        user: { id: 'teacher-1' },
        tokenPointsLimit: 80,
      });

      expect(update.set).toHaveBeenCalledWith({ tokenPointsLimit: 80 });
      expect(result).toEqual(updatedShare);
    });
  });
});
