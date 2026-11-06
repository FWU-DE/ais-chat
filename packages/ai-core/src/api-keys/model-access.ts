import { dbHasApiKeyAccessToModel } from '@ais-chat/api-database';

import type { AiModel as TextAiModel } from '../chat/types';
import { AiModel } from '../images/types';

/**
 * Checks whether the specified API key has access to the given model.
 *
 * @param apiKeyId - The unique identifier of the API key to check access for.
 * @param model - The model to verify access against.
 * @returns A promise that resolves to `true` if the API key has access to the model, `false` otherwise.
 */
export async function hasAccessToModel(
  apiKeyId: string,
  model: AiModel | TextAiModel,
): Promise<boolean> {
  return dbHasApiKeyAccessToModel({ apiKeyId, modelId: model.id });
}
