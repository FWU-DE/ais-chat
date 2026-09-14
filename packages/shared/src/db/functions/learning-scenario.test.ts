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
  dbExtendSharedLearningScenarioExpiration,
  dbGetAllAccessibleLearningScenarios,
  dbGetAllLearningScenariosByUser,
  dbGetCommunityLearningScenarios,
  dbGetGlobalLearningScenarios,
  dbGetLearningScenarioById,
  dbGetLearningScenarioByIdAndInviteCode,
  dbGetLearningScenarioByIdForConversation,
  dbGetLearningScenarioByIdOptionalShareData,
  dbGetLearningScenarioByIdWithShareData,
  dbGetLearningScenariosByAssociatedSchools,
  dbGetLearningScenariosByIds,
  dbGetLearningScenariosByUser,
  dbLiftSuspensionOnLearningScenario,
  dbSetLearningScenarioSuspended,
  dbUpdateLearningScenarioShareTokenPointsLimit,
} from './learning-scenario';
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

// Learning scenario queries that surface share data build a `latestActiveLearningScenarioShare`
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

describe('db learning scenario sharing helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('learning scenario read queries', () => {
    beforeEach(() => {
      mockShareSubquery();
    });

    it('dbGetGlobalLearningScenarios returns global learning scenarios', async () => {
      const learningScenarios = [{ id: 'scenario-1' }];
      mockSelectChain(learningScenarios);

      const result = await dbGetGlobalLearningScenarios({
        user: { id: 'user-1', federalStateId: 'federal-state-1' },
      });

      expect(result).toBe(learningScenarios);
    });

    it('dbGetLearningScenariosByAssociatedSchools returns an empty array without querying the db when the user has no schools', async () => {
      const result = await dbGetLearningScenariosByAssociatedSchools({
        user: { id: 'user-1', schoolIds: [] },
      });

      expect(result).toEqual([]);
      expect(mocks.select).not.toHaveBeenCalled();
    });

    it('dbGetLearningScenariosByAssociatedSchools queries the db when the user has schools', async () => {
      const learningScenarios = [{ id: 'scenario-1' }];
      mockSelectChain(learningScenarios);

      const result = await dbGetLearningScenariosByAssociatedSchools({
        user: { id: 'user-1', schoolIds: ['school-1'] },
      });

      expect(result).toBe(learningScenarios);
    });

    it('dbGetCommunityLearningScenarios returns community learning scenarios', async () => {
      const learningScenarios = [{ id: 'scenario-1' }];
      mockSelectChain(learningScenarios);

      const result = await dbGetCommunityLearningScenarios({ user: { id: 'user-1' } });

      expect(result).toBe(learningScenarios);
    });

    it('dbGetLearningScenariosByUser returns the private learning scenarios owned by the user', async () => {
      const learningScenarios = [{ id: 'scenario-1' }];
      mockSelectChain(learningScenarios);

      const result = await dbGetLearningScenariosByUser({ user: { id: 'user-1' } });

      expect(result).toBe(learningScenarios);
    });

    it('dbGetAllLearningScenariosByUser returns all learning scenarios owned by the user', async () => {
      const learningScenarios = [{ id: 'scenario-1' }];
      mockSelectChain(learningScenarios);

      const result = await dbGetAllLearningScenariosByUser({ user: { id: 'user-1' } });

      expect(result).toBe(learningScenarios);
    });

    it('dbGetAllAccessibleLearningScenarios returns all accessible learning scenarios', async () => {
      const learningScenarios = [{ id: 'scenario-1' }];
      mockSelectChain(learningScenarios);

      const result = await dbGetAllAccessibleLearningScenarios({
        user: { id: 'user-1', schoolIds: [], federalStateId: 'federal-state-1' },
      });

      expect(result).toBe(learningScenarios);
    });

    it('dbGetLearningScenarioById returns the matching learning scenario', async () => {
      const learningScenario = { id: 'scenario-1' };
      mockSelectChain([learningScenario]);

      const result = await dbGetLearningScenarioById({ learningScenarioId: 'scenario-1' });

      expect(result).toBe(learningScenario);
    });

    it('dbGetLearningScenarioByIdForConversation returns the learning scenario when linked to the conversation', async () => {
      const learningScenario = { id: 'scenario-1' };
      mockSelectChain([learningScenario]);

      const result = await dbGetLearningScenarioByIdForConversation({
        learningScenarioId: 'scenario-1',
        conversationId: 'conversation-1',
        userId: 'user-1',
      });

      expect(result).toBe(learningScenario);
    });

    it('dbGetLearningScenarioByIdForConversation returns undefined when not linked to the conversation', async () => {
      mockSelectChain([]);

      const result = await dbGetLearningScenarioByIdForConversation({
        learningScenarioId: 'scenario-1',
        conversationId: 'conversation-1',
        userId: 'user-1',
      });

      expect(result).toBeUndefined();
    });

    it('dbGetLearningScenariosByIds returns an empty array without querying the db when given no ids', async () => {
      const result = await dbGetLearningScenariosByIds({ learningScenarioIds: [] });

      expect(result).toEqual([]);
      expect(mocks.select).not.toHaveBeenCalled();
    });

    it('dbGetLearningScenariosByIds queries the db when given ids', async () => {
      const learningScenarios = [{ id: 'scenario-1' }];
      mockSelectChain(learningScenarios);

      const result = await dbGetLearningScenariosByIds({ learningScenarioIds: ['scenario-1'] });

      expect(result).toBe(learningScenarios);
    });

    it('dbGetLearningScenarioByIdWithShareData returns the matching row', async () => {
      const row = { id: 'scenario-1' };
      mockSelectChain([row]);

      const result = await dbGetLearningScenarioByIdWithShareData({
        learningScenarioId: 'scenario-1',
        user: { id: 'user-1' },
      });

      expect(result).toBe(row);
    });

    it('dbGetLearningScenarioByIdOptionalShareData returns the matching row', async () => {
      const row = { id: 'scenario-1' };
      mockSelectChain([row]);

      const result = await dbGetLearningScenarioByIdOptionalShareData({
        learningScenarioId: 'scenario-1',
        user: { id: 'user-1' },
      });

      expect(result).toBe(row);
    });

    it('dbGetLearningScenarioByIdAndInviteCode returns the matching row', async () => {
      const row = { id: 'scenario-1' };
      mockSelectChain([row]);

      const result = await dbGetLearningScenarioByIdAndInviteCode({
        learningScenarioId: 'scenario-1',
        inviteCode: 'invite-1',
      });

      expect(result).toBe(row);
    });
  });

  describe('dbSetLearningScenarioSuspended', () => {
    it('suspends the learning scenario and returns the refreshed record, including deleted ones', async () => {
      mockUpdateReturning([{ id: 'scenario-1' }]);
      const suspendedLearningScenario = { id: 'scenario-1', suspended: true };
      mockSelectChain([suspendedLearningScenario]);

      const result = await dbSetLearningScenarioSuspended({ learningScenarioId: 'scenario-1' });

      expect(result).toBe(suspendedLearningScenario);
    });

    it('throws NotFoundError when the learning scenario does not exist', async () => {
      mockUpdateReturning([]);

      await expect(
        dbSetLearningScenarioSuspended({ learningScenarioId: 'missing' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the refreshed record cannot be found after updating', async () => {
      mockUpdateReturning([{ id: 'scenario-1' }]);
      mockSelectChain([]);

      await expect(
        dbSetLearningScenarioSuspended({ learningScenarioId: 'scenario-1' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('dbLiftSuspensionOnLearningScenario', () => {
    it('lifts the suspension and returns the refreshed record, including deleted ones', async () => {
      mockUpdateReturning([{ id: 'scenario-1' }]);
      const learningScenario = { id: 'scenario-1', suspended: false };
      mockSelectChain([learningScenario]);

      const result = await dbLiftSuspensionOnLearningScenario({
        learningScenarioId: 'scenario-1',
      });

      expect(result).toBe(learningScenario);
    });

    it('throws NotFoundError when the learning scenario does not exist', async () => {
      mockUpdateReturning([]);

      await expect(
        dbLiftSuspensionOnLearningScenario({ learningScenarioId: 'missing' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the refreshed record cannot be found after updating', async () => {
      mockUpdateReturning([{ id: 'scenario-1' }]);
      mockSelectChain([]);

      await expect(
        dbLiftSuspensionOnLearningScenario({ learningScenarioId: 'scenario-1' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('dbExtendSharedLearningScenarioExpiration', () => {
    it('returns null when there is no active unstopped share', async () => {
      mockSelectLatestShare([]);

      const result = await dbExtendSharedLearningScenarioExpiration({
        learningScenarioId: 'scenario-1',
        user: { id: 'teacher-1' },
        additionalTimeInMinutes: 30,
      });

      expect(result).toBeNull();
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('extends from current expiration when expiration is in the future', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

      const latestShare = {
        id: 'share-1',
        expiredAt: new Date('2026-01-01T10:40:00.000Z'),
      };
      mockSelectLatestShare([latestShare]);
      const update = mockUpdateReturning([{ ...latestShare, expiredAt: new Date() }]);

      await dbExtendSharedLearningScenarioExpiration({
        learningScenarioId: 'scenario-1',
        user: { id: 'teacher-1' },
        additionalTimeInMinutes: 10,
      });

      expect(update.set).toHaveBeenCalledWith({
        expiredAt: new Date('2026-01-01T10:50:00.000Z'),
      });
    });

    it('extends from now when the existing expiration is already in the past', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

      const latestShare = {
        id: 'share-1',
        expiredAt: new Date('2026-01-01T09:50:00.000Z'),
      };
      mockSelectLatestShare([latestShare]);
      const update = mockUpdateReturning([{ ...latestShare, expiredAt: new Date() }]);

      await dbExtendSharedLearningScenarioExpiration({
        learningScenarioId: 'scenario-1',
        user: { id: 'teacher-1' },
        additionalTimeInMinutes: 25,
      });

      expect(update.set).toHaveBeenCalledWith({
        expiredAt: new Date('2026-01-01T10:25:00.000Z'),
      });
    });
  });

  describe('dbUpdateLearningScenarioShareTokenPointsLimit', () => {
    it('returns null when there is no active unstopped share', async () => {
      mockSelectLatestShare([]);

      const result = await dbUpdateLearningScenarioShareTokenPointsLimit({
        learningScenarioId: 'scenario-1',
        user: { id: 'teacher-1' },
        tokenPointsLimit: 60,
      });

      expect(result).toBeNull();
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('updates token points limit for latest active share', async () => {
      const latestShare = {
        id: 'share-1',
        tokenPointsLimit: 40,
      };
      const updatedShare = {
        ...latestShare,
        tokenPointsLimit: 65,
      };
      mockSelectLatestShare([latestShare]);
      const update = mockUpdateReturning([updatedShare]);

      const result = await dbUpdateLearningScenarioShareTokenPointsLimit({
        learningScenarioId: 'scenario-1',
        user: { id: 'teacher-1' },
        tokenPointsLimit: 65,
      });

      expect(update.set).toHaveBeenCalledWith({ tokenPointsLimit: 65 });
      expect(result).toEqual(updatedShare);
    });
  });
});
