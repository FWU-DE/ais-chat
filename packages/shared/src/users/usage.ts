import {
  dbGetLearningScenarioChatUsageInCentByLearningScenarioId,
  dbGetSharedCharacterChatUsageInCentByCharacterId,
} from '@shared/db/functions/token-points';
import { CharacterWithShareDataModel, LearningScenarioWithShareDataModel } from '@shared/db/schema';
import { FederalStateModel } from '@shared/federal-states/types';
import {
  calculateShareSessionState,
  ShareSessionState,
} from '@shared/sharing/calculate-share-session-state';
import {
  getMaxBudgetInCentByUser,
  getUsedBudgetInCentByUser,
} from '@shared/users/user-budget-service';

type SharedChatUser = {
  id: string;
  userRole: 'student' | 'teacher';
  federalState?: FederalStateModel | null;
};

type SharedChatSession = Pick<
  CharacterWithShareDataModel,
  'id' | 'tokenPointsLimit' | 'startedAt' | 'expiredAt'
>;

type SharedLearningScenarioSession = Pick<
  LearningScenarioWithShareDataModel,
  'id' | 'tokenPointsLimit' | 'startedAt' | 'expiredAt'
>;

/**
 * Calculates the shared chat limit in cents
 * @param user - The user and context
 * @param tokenPointsPercentageLimit - The percentage limit (e.g., 10 for 10%)
 * @returns The calculated limit in cents
 */
async function calculateSharedChatLimitInCent(
  user: SharedChatUser,
  tokenPointsPercentageLimit: number,
): Promise<number> {
  const maxBudgetInCent = await getMaxBudgetInCentByUser({
    user,
    federalState: user.federalState,
  });
  return ((maxBudgetInCent ?? 0) * tokenPointsPercentageLimit) / 100;
}

export async function sharedLearningScenarioChatHasReachedTokenPointsLimit({
  user,
  learningScenario,
}: {
  user: SharedChatUser | undefined;
  learningScenario: SharedLearningScenarioSession;
}) {
  if (user === undefined || user.federalState === undefined) {
    return true;
  }

  const sharedChatUsageInCent = await dbGetLearningScenarioChatUsageInCentByLearningScenarioId({
    learningScenarioId: learningScenario.id,
    userId: user.id,
    expiredAt: learningScenario.expiredAt,
    startedAt: learningScenario.startedAt,
  });

  if (
    user.userRole === 'teacher' &&
    sharedChatUsageInCent <
      (await calculateSharedChatLimitInCent(user, learningScenario.tokenPointsLimit))
  ) {
    return false;
  }

  return true;
}

export async function sharedCharacterChatHasReachedTokenPointsLimit({
  user,
  character,
}: {
  user: SharedChatUser | undefined;
  character: SharedChatSession;
}) {
  if (user === undefined || user.federalState === undefined) {
    return true;
  }

  const characterUsageInCent = await dbGetSharedCharacterChatUsageInCentByCharacterId({
    characterId: character.id,
    userId: user.id,
    expiredAt: character.expiredAt,
    startedAt: character.startedAt,
  });

  if (
    user.userRole === 'teacher' &&
    characterUsageInCent < (await calculateSharedChatLimitInCent(user, character.tokenPointsLimit))
  ) {
    return false;
  }

  return true;
}

export function sharedChatHasExpired({
  expiredAt,
  manuallyStoppedAt,
}: {
  expiredAt: Date;
  manuallyStoppedAt?: Date | null;
}) {
  // Manually stopped by the user
  if (manuallyStoppedAt) {
    return true;
  }

  if (
    calculateShareSessionState({ expiredAt, manuallyStoppedAt }).shareSessionState !==
    ShareSessionState.RUNNING
  ) {
    // the shared chat is no viable anymore so the limit is reached
    return true;
  }
  return false;
}

export async function userHasReachedTokenPointsLimit({
  user,
}: {
  user: SharedChatUser | undefined;
}) {
  if (user === undefined || user.federalState === undefined) {
    return false;
  }

  const usedBudget = await getUsedBudgetInCentByUser({ user });
  const maxBudget = await getMaxBudgetInCentByUser({ user, federalState: user.federalState });

  if (usedBudget !== null && maxBudget !== null && usedBudget > maxBudget) {
    return true;
  }
  return false;
}
