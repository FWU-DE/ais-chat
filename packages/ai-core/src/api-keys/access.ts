import { dbValidateApiKeyById } from '@ais-chat/api-database';

import type { AiModel as TextAiModel } from '../chat/types';
import { ApiKeyQuotaExceededError, ApiKeyUnusableError, InvalidModelError } from '../errors';
import { AiModel } from '../images/types';
import { isApiKeyOverQuota } from './billing';
import { hasAccessToModel } from './model-access';

/**
 * Verifies that the API key is usable, has access to the model and is within its monthly quota.
 *
 * @throws ApiKeyUnusableError if the API key is expired, inactive, deleted or missing
 * @throws InvalidModelError if the API key has no access to the model
 * @throws ApiKeyQuotaExceededError if the API key has exceeded its monthly quota
 */
export async function assertApiKeyCanUseModel(
  apiKeyId: string,
  model: AiModel | TextAiModel,
  modelKind: 'text' | 'embedding' | 'image',
): Promise<void> {
  // Run all checks in parallel for better performance
  const [hasAccess, isOverQuota, apiKeyValidation] = await Promise.all([
    hasAccessToModel(apiKeyId, model),
    isApiKeyOverQuota(apiKeyId),
    dbValidateApiKeyById(apiKeyId),
  ]);

  if (!apiKeyValidation.valid) {
    throw new ApiKeyUnusableError({ apiKeyId, reason: apiKeyValidation.reason });
  }

  if (!hasAccess) {
    throw new InvalidModelError(
      `API key does not have access to the ${modelKind} model: ${model.name}`,
    );
  }

  if (isOverQuota) {
    throw new ApiKeyQuotaExceededError(`API key has exceeded its monthly quota`);
  }
}
