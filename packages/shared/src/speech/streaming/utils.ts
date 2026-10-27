import { UserModel } from '@shared/auth/user-model';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';
import { LlmModelSelectModel } from '@shared/db/schema';
import { NotFoundError } from '@shared/error';
import { FederalStateModel } from '@shared/federal-states/types';
import { constructTokenBudgetExceededEvent, sendRabbitmqEvent } from '@shared/rabbitmq';
import { userHasReachedTokenPointsLimit } from '@shared/users/usage';
import type { SpeechStreamingPipelineParams } from './speech-pipeline';

export const checkAccess = (
  params: SpeechStreamingPipelineParams,
  context: { userId: string },
): Promise<boolean> => {
  if (context.userId !== params.user.id) {
    return Promise.resolve(false);
  }
  return Promise.resolve(true);
};

export const getSpeechModel = async (): Promise<LlmModelSelectModel> => {
  const model = await dbGetSpeechModel();
  if (model === undefined) throw new NotFoundError('Speech model not found');
  return model;
};

export const checkAvailableBudget = async (user: UserModel, federalState: FederalStateModel) => {
  const hasReachedLimit = await userHasReachedTokenPointsLimit({
    user: { ...user, federalState },
  });
  return Promise.resolve(!hasReachedLimit);
};

export const raiseBudgetExceededEvent = (user: UserModel) => {
  return sendRabbitmqEvent(
    constructTokenBudgetExceededEvent({
      user: { ...user, federalState: { id: user.federalStateId } },
    }),
  );
};
