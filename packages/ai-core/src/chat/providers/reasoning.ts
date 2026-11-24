import type { AiModel } from '../types';

/** Builds the `reasoning` request parameter (OpenAI Responses); spread into the request, empty when the model has none. */
export function getReasoningRequestParams(model: Pick<AiModel, 'reasoning'>) {
  return model.reasoning ? { reasoning: model.reasoning } : {};
}
