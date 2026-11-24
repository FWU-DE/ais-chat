import type { AiModel } from '../types';

/** Request parameter for the OpenAI Responses `reasoning` option; empty when the model has none. */
export function getReasoningParameter(model: Pick<AiModel, 'reasoning'>) {
  return model.reasoning ? { reasoning: model.reasoning } : {};
}
