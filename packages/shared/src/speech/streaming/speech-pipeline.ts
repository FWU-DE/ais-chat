import { TokenPointsExceededError } from '@ais-chat/ai-core';
import { UserModel } from '@shared/auth/user-model';
import { LlmModelSelectModel } from '@shared/db/schema';
import { ForbiddenError, NotFoundError } from '@shared/error';
import { FederalStateModel } from '@shared/federal-states/types';
import { ChatSpeechStreamResult } from '../types';
import { startStream } from './start-streaming';
import {
  checkAccess,
  checkAvailableBudget,
  getSpeechModel,
  raiseBudgetExceededEvent,
  TokenAvailability,
} from './utils';

export type SpeechStreamingPipelineParams = {
  user: UserModel;
  federalState: FederalStateModel;
  conversationId?: string;
  input: string;
  voice?: string;
  abortSignal?: AbortSignal;
};

/**
 * Strategy pattern for speech streaming.
 * Several functions can be overridden to customize the behavior of the pipeline.
 * For example shared chats and normal chats need different contexts.
 * Normal chat messages are stored in database as conversation.
 */
export type SpeechStreamingPipelineStrategy<TContext extends { user: { id: string } }> = {
  /** Load the relevant context like the conversation */
  loadContext(params: SpeechStreamingPipelineParams): Promise<TContext>;
  checkAccess?: (params: SpeechStreamingPipelineParams, context: TContext) => Promise<boolean>;
  checkBudget?: (
    params: SpeechStreamingPipelineParams,
    context: TContext,
  ) => Promise<TokenAvailability>;
  /** Store the usage of the speech model for the given params and context */
  storeUsage(
    params: SpeechStreamingPipelineParams,
    context: TContext,
    model: LlmModelSelectModel,
    result: ChatSpeechStreamResult,
  ): Promise<void>;
  /** Report the usage of the speech model for the given params and result */
  reportUsage(
    params: SpeechStreamingPipelineParams,
    context: TContext,
    model: LlmModelSelectModel,
    result: ChatSpeechStreamResult,
  ): Promise<void>;
};

export async function runSpeechPipeline<TContext extends { user: { id: string } }>(
  params: SpeechStreamingPipelineParams,
  strategy: SpeechStreamingPipelineStrategy<TContext>,
): Promise<ChatSpeechStreamResult> {
  const context = await strategy.loadContext(params);
  const hasAccess = strategy.checkAccess
    ? await strategy.checkAccess(params, context)
    : await checkAccess(params, context);
  if (!hasAccess) {
    throw new ForbiddenError('Access denied');
  }

  const budgetInfo = strategy.checkBudget
    ? await strategy.checkBudget(params, context)
    : await checkAvailableBudget(params.user, params.federalState);
  if (budgetInfo === 'userTokenLimitReached') {
    await raiseBudgetExceededEvent(params.user);
    throw new TokenPointsExceededError();
  } else if (budgetInfo === 'entityTokenLimitReached') {
    throw new TokenPointsExceededError();
  }

  const model = await getSpeechModel();
  if (!model) throw new NotFoundError('No speech model configured');

  return startStream(params, model, async (result) => {
    // stream finished
    await strategy.storeUsage(params, context, model, result);
    await strategy.reportUsage(params, context, model, result);
  });
}
