import { UserModel, userSchema } from '@shared/auth/user-model';
import { dbGetUserById, dbUpdateLastUsedModelByUserId } from '@shared/db/functions/user';
import { NotFoundError } from '@shared/error';
import { getFederalStateById } from '@shared/federal-states/federal-state-service';
import { FederalStateModel } from '@shared/federal-states/types';

/**
 * Stores the last used model of the user in the database
 * and returns the updated user
 */
export async function setLastUsedModelOfUser({
  userId,
  modelName,
}: {
  userId: string;
  modelName: string;
}): Promise<UserModel> {
  const updatedUser = await dbUpdateLastUsedModelByUserId({ userId, modelName });
  return userSchema.parse(updatedUser);
}

export async function getUser({ userId }: { userId: string }): Promise<UserModel> {
  const user = await dbGetUserById({ userId });
  if (user === undefined) {
    throw new NotFoundError('User not found');
  }
  const { federalStateId } = user;
  if (federalStateId === null) {
    throw new Error('User has no federal state assigned');
  }
  return { ...user, federalStateId };
}

export async function getUserWithFederalState({
  userId,
}: {
  userId: string;
}): Promise<{ user: UserModel; federalState: FederalStateModel }> {
  const user = await getUser({ userId });
  const federalState = await getFederalStateById(user.federalStateId);
  return { user, federalState };
}
