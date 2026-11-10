import { UserModel } from '@shared/auth/user-model';
import {
  dbGetCharacterSharedChatsUsageInCentByUserId,
  dbGetChatsUsageInCentByUserId,
  dbGetLearningScenarioUsageInCentByUserId,
} from '@shared/db/functions/token-points';
import { dbGetCreditIncreaseForCurrentMonth } from '@shared/db/functions/voucher';
import { FederalStateModel } from '@shared/federal-states/types';

export async function getMaxBudgetInCentByUser({
  user,
  federalState,
}: {
  user: Pick<UserModel, 'id' | 'userRole'>;
  federalState?: FederalStateModel | null;
}) {
  if (federalState === undefined || federalState === null) return null;

  const codeBonus = await dbGetCreditIncreaseForCurrentMonth(user.id);

  if (user.userRole === 'student') {
    return federalState.studentPriceLimit + codeBonus;
  }

  if (user.userRole === 'teacher') {
    return federalState.teacherPriceLimit + codeBonus;
  }

  return 500;
}

export async function getUsedBudgetInCentByUser({
  user,
}: {
  user: Pick<UserModel, 'id' | 'userRole'>;
}) {
  // students cannot have shared chats
  const sharedChatsUsageInCent =
    user.userRole !== 'student'
      ? await dbGetLearningScenarioUsageInCentByUserId({ userId: user.id })
      : 0;

  const characterSharedChatsUsageInCent = await dbGetCharacterSharedChatsUsageInCentByUserId({
    userId: user.id,
  });

  const chatUsageInCent = await dbGetChatsUsageInCentByUserId({ userId: user.id });

  return sharedChatsUsageInCent + characterSharedChatsUsageInCent + chatUsageInCent;
}
