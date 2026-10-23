import { TokenPointsExceededError } from '@ais-chat/ai-core';
import { UserModel } from '@shared/auth/user-model';
import { ForbiddenError } from '@shared/error';

export type SpeechPipelineRequest = {
  user: UserModel;
  conversationId?: string;
  input: string;
  voice?: string;
  abortSignal?: AbortSignal;
};

export type SpeechPipelineStrategy<TContext, TModel, TResult> = {
  /** Load the relevant context like the conversation */
  getContext(request: SpeechPipelineRequest): Promise<TContext>;
  /** Verifies that the user has access to the requested resource */
  verifyAccess(request: SpeechPipelineRequest, context: TContext): Promise<boolean>;
  /** Check if the user has enough budget */
  checkAvailableBudget(request: SpeechPipelineRequest): Promise<boolean>;
  /** Raise an event for the reporting portal when the user's budget is exceeded */
  raiseBudgetExceededEvent(request: SpeechPipelineRequest, context: TContext): Promise<void>;
  /** Get the speech model to be used for generating speech */
  getModel(request: SpeechPipelineRequest): Promise<TModel>;
  /**
   * Generate the speech stream for the given request and model. Usage is only known once
   * generation has actually finished (e.g. once a streamed result has been fully consumed or
   * cancelled), so implementations must call `reportUsage` themselves at that point instead of
   * it being invoked automatically as soon as this method resolves.
   */
  generateSpeechStream(
    request: SpeechPipelineRequest,
    model: TModel,
    reportUsage: (result: TResult) => Promise<void>,
  ): Promise<TResult>;
  /** Report the usage of the speech model for the given request and result */
  reportUsage(
    request: SpeechPipelineRequest,
    context: TContext,
    model: TModel,
    result: TResult,
  ): Promise<void>;
};

export async function runSpeechPipeline<TContext, TModel, TResult>(
  request: SpeechPipelineRequest,
  strategy: SpeechPipelineStrategy<TContext, TModel, TResult>,
): Promise<TResult> {
  const context = await strategy.getContext(request);
  const hasAccess = await strategy.verifyAccess(request, context);
  if (!hasAccess) {
    throw new ForbiddenError('Access denied');
  }

  const hasEnoughBudget = await strategy.checkAvailableBudget(request);
  if (!hasEnoughBudget) {
    await strategy.raiseBudgetExceededEvent(request, context);
    throw new TokenPointsExceededError();
  }
  const model = await strategy.getModel(request);

  return strategy.generateSpeechStream(request, model, (result) =>
    strategy.reportUsage(request, context, model, result),
  );
}
