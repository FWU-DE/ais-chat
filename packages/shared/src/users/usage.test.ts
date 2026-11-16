import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/db/functions/token-points', () => ({
  dbGetLearningScenarioChatUsageInCentByLearningScenarioId: vi.fn(),
  dbGetSharedCharacterChatUsageInCentByCharacterId: vi.fn(),
}));

vi.mock('@shared/users/user-budget-service', () => ({
  getMaxBudgetInCentByUser: vi.fn(),
  getUsedBudgetInCentByUser: vi.fn(),
}));

import {
  dbGetLearningScenarioChatUsageInCentByLearningScenarioId,
  dbGetSharedCharacterChatUsageInCentByCharacterId,
} from '@shared/db/functions/token-points';
import { type FederalStateModel } from '@shared/federal-states/types';
import { getMaxBudgetInCentByUser } from '@shared/users/user-budget-service';

import { sharedChatHasExpired } from './usage';

type TestSharedChatUser = {
  id: string;
  userRole: 'student' | 'teacher';
  federalState: FederalStateModel;
};

type TestSharedLearningScenario = {
  id: string;
  startedAt: Date;
  expiredAt: Date;
  maxUsageTimeLimit: number;
  tokenPointsLimit: number;
};

type TestSharedCharacter = TestSharedLearningScenario;

const mockFederalState = (): FederalStateModel =>
  ({
    id: 'state-1',
    teacherPriceLimit: 1000,
    studentPriceLimit: 200,
    createdAt: new Date(),
    mandatoryCertificationTeacher: null,
    chatStorageTime: 120,
    supportContacts: null,
    trainingLink: null,
    featureToggles: {
      isStudentAccessEnabled: true,
      isCharacterEnabled: true,
      isSharedChatEnabled: true,
      isCustomGptEnabled: true,
      isShareTemplateWithSchoolEnabled: true,
      isImageGenerationEnabled: true,
      isWebSearchEnabled: true,
    },
    designConfiguration: null,
    appName: null,
    pictureUrls: null,
    apiKeyId: null,
    hasApiKeyAssigned: false,
  }) as unknown as FederalStateModel;

describe('sharedChatHasExpired', () => {
  const now = new Date('2024-06-01T10:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('manually stopped (manuallyStoppedAt)', () => {
    it('returns true when manuallyStoppedAt is set, even if time limit has not been reached', () => {
      const expiredAt = new Date(now.getTime() + 55 * 60_000); // expires in 55 minutes
      const result = sharedChatHasExpired({
        expiredAt,
        manuallyStoppedAt: new Date(now.getTime() - 1000),
      });
      expect(result).toBe(true);
    });

    it('returns true when manuallyStoppedAt equals now', () => {
      const expiredAt = new Date(now.getTime() + 20 * 60_000); // expires in 20 minutes
      const result = sharedChatHasExpired({
        expiredAt,
        manuallyStoppedAt: now,
      });
      expect(result).toBe(true);
    });
  });

  describe('auto-expiry based on time limit', () => {
    it('returns false when the time limit has not been reached', () => {
      const expiredAt = new Date(now.getTime() + 20 * 60_000); // expires in 20 minutes
      const result = sharedChatHasExpired({
        expiredAt,
      });
      expect(result).toBe(false);
    });

    it('returns true when the time limit has been exceeded', () => {
      const expiredAt = new Date(now.getTime() - 30 * 60_000); // expired 30 minutes ago
      const result = sharedChatHasExpired({
        expiredAt,
      });
      expect(result).toBe(true);
    });

    it('returns true when the time limit has just been reached (0 seconds left)', () => {
      const expiredAt = new Date(now.getTime()); // expired exactly now
      const result = sharedChatHasExpired({
        expiredAt,
      });
      expect(result).toBe(true);
    });
  });
});

describe('coverage for uncovered branches', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sharedLearningScenarioChatHasReachedTokenPointsLimit returns true for undefined user', async () => {
    const { sharedLearningScenarioChatHasReachedTokenPointsLimit } = await import('./usage');

    const result = await sharedLearningScenarioChatHasReachedTokenPointsLimit({
      user: undefined,
      learningScenario: {
        id: 'scenario-1',
        startedAt: new Date(),
        expiredAt: new Date(new Date().getTime() + 60 * 60_000),
        maxUsageTimeLimit: 60,
        tokenPointsLimit: 10,
      } as TestSharedLearningScenario,
    });

    expect(result).toBe(true);
    expect(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).not.toHaveBeenCalled();
  });

  it('sharedLearningScenarioChatHasReachedTokenPointsLimit evaluates usage when chat has expired', async () => {
    const { sharedLearningScenarioChatHasReachedTokenPointsLimit } = await import('./usage');

    const mockUser = {
      id: 'user-1',
      userRole: 'teacher' as const,
      federalState: mockFederalState(),
    } satisfies TestSharedChatUser;

    vi.mocked(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).mockResolvedValue(50);
    vi.mocked(getMaxBudgetInCentByUser).mockResolvedValue(1000);

    const result = await sharedLearningScenarioChatHasReachedTokenPointsLimit({
      user: mockUser,
      learningScenario: {
        id: 'scenario-1',
        startedAt: new Date('2024-06-01T08:00:00.000Z'),
        expiredAt: new Date('2024-06-01T09:00:00.000Z'),
        maxUsageTimeLimit: 60,
        tokenPointsLimit: 10,
      } as TestSharedLearningScenario,
    });

    expect(result).toBe(false);
    expect(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).toHaveBeenCalled();
  });

  it('sharedLearningScenarioChatHasReachedTokenPointsLimit handles teacher with usage below limit', async () => {
    const { sharedLearningScenarioChatHasReachedTokenPointsLimit } = await import('./usage');

    const mockUser = {
      id: 'user-1',
      userRole: 'teacher' as const,
      federalState: mockFederalState(),
    } satisfies TestSharedChatUser;

    const mockScenario = {
      id: 'scenario-1',
      startedAt: new Date(),
      expiredAt: new Date(new Date().getTime() + 60 * 60_000),
      maxUsageTimeLimit: 60,
      tokenPointsLimit: 10,
    } satisfies TestSharedLearningScenario;

    vi.mocked(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).mockResolvedValue(50); // below 100 (10% of 1000)
    vi.mocked(getMaxBudgetInCentByUser).mockResolvedValue(1000);

    const result = await sharedLearningScenarioChatHasReachedTokenPointsLimit({
      user: mockUser,
      learningScenario: mockScenario,
    });

    expect(result).toBe(false);
    expect(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).toHaveBeenCalledWith({
      learningScenarioId: 'scenario-1',
      userId: mockUser.id,
      expiredAt: mockScenario.expiredAt,
      startedAt: mockScenario.startedAt,
    });
  });

  it('sharedLearningScenarioChatHasReachedTokenPointsLimit handles teacher above limit', async () => {
    const { sharedLearningScenarioChatHasReachedTokenPointsLimit } = await import('./usage');

    const mockUser = {
      id: 'user-1',
      userRole: 'teacher' as const,
      federalState: mockFederalState(),
    } satisfies TestSharedChatUser;

    const mockScenario = {
      id: 'scenario-1',
      startedAt: new Date(),
      expiredAt: new Date(new Date().getTime() + 60 * 60_000),
      maxUsageTimeLimit: 60,
      tokenPointsLimit: 10,
    } satisfies TestSharedLearningScenario;

    vi.mocked(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).mockResolvedValue(150); // above 100
    vi.mocked(getMaxBudgetInCentByUser).mockResolvedValue(1000);

    const result = await sharedLearningScenarioChatHasReachedTokenPointsLimit({
      user: mockUser,
      learningScenario: mockScenario,
    });

    expect(result).toBe(true);
  });

  it('sharedCharacterChatHasReachedTokenPointsLimit handles teacher below limit and forwards timestamps', async () => {
    const { sharedCharacterChatHasReachedTokenPointsLimit } = await import('./usage');

    const mockUser = {
      id: 'user-1',
      userRole: 'teacher' as const,
      federalState: mockFederalState(),
    } satisfies TestSharedChatUser;

    const mockCharacter = {
      id: 'character-1',
      startedAt: new Date(),
      expiredAt: new Date(new Date().getTime() + 60 * 60_000),
      maxUsageTimeLimit: 60,
      tokenPointsLimit: 10,
    } satisfies TestSharedCharacter;

    vi.mocked(dbGetSharedCharacterChatUsageInCentByCharacterId).mockResolvedValue(50);
    vi.mocked(getMaxBudgetInCentByUser).mockResolvedValue(1000);

    const result = await sharedCharacterChatHasReachedTokenPointsLimit({
      user: mockUser,
      character: mockCharacter,
    });

    expect(result).toBe(false);
    expect(dbGetSharedCharacterChatUsageInCentByCharacterId).toHaveBeenCalledWith({
      characterId: 'character-1',
      userId: mockUser.id,
      expiredAt: mockCharacter.expiredAt,
      startedAt: mockCharacter.startedAt,
    });
  });

  it('sharedCharacterChatHasReachedTokenPointsLimit evaluates usage when expired', async () => {
    const { sharedCharacterChatHasReachedTokenPointsLimit } = await import('./usage');

    const mockUser = {
      id: 'user-1',
      userRole: 'teacher' as const,
      federalState: mockFederalState(),
    } satisfies TestSharedChatUser;

    vi.mocked(dbGetSharedCharacterChatUsageInCentByCharacterId).mockResolvedValue(50);
    vi.mocked(getMaxBudgetInCentByUser).mockResolvedValue(1000);

    const result = await sharedCharacterChatHasReachedTokenPointsLimit({
      user: mockUser,
      character: {
        id: 'character-1',
        startedAt: new Date('2024-06-01T08:00:00.000Z'),
        expiredAt: new Date('2024-06-01T09:00:00.000Z'),
        maxUsageTimeLimit: 60,
        tokenPointsLimit: 10,
      } as TestSharedCharacter,
    });

    expect(result).toBe(false);
    expect(dbGetSharedCharacterChatUsageInCentByCharacterId).toHaveBeenCalled();
  });

  it('userHasReachedTokenPointsLimit handles exceeding budget', async () => {
    const { userHasReachedTokenPointsLimit } = await import('./usage');
    const { getUsedBudgetInCentByUser } = await import('@shared/users/user-budget-service');

    const mockUser = {
      id: 'user-1',
      userRole: 'teacher' as const,
      federalState: mockFederalState(),
    } satisfies TestSharedChatUser;

    vi.mocked(getUsedBudgetInCentByUser).mockResolvedValue(1500); // exceeds 1000
    vi.mocked(getMaxBudgetInCentByUser).mockResolvedValue(1000);

    const result = await userHasReachedTokenPointsLimit({
      user: mockUser,
    });

    expect(result).toBe(true);
  });

  it('userHasReachedTokenPointsLimit returns false for undefined user', async () => {
    const { userHasReachedTokenPointsLimit } = await import('./usage');

    const result = await userHasReachedTokenPointsLimit({
      user: undefined,
    });

    expect(result).toBe(false);
  });

  it('userHasReachedTokenPointsLimit returns false when max budget is null', async () => {
    const { userHasReachedTokenPointsLimit } = await import('./usage');
    const { getUsedBudgetInCentByUser } = await import('@shared/users/user-budget-service');

    const mockUser = {
      id: 'user-1',
      userRole: 'teacher' as const,
      federalState: mockFederalState(),
    } satisfies TestSharedChatUser;

    vi.mocked(getUsedBudgetInCentByUser).mockResolvedValue(250);
    vi.mocked(getMaxBudgetInCentByUser).mockResolvedValue(null);

    const result = await userHasReachedTokenPointsLimit({
      user: mockUser,
    });

    expect(result).toBe(false);
  });
});
