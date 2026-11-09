import { isDateBefore } from '../date';
import type { ApiKeyModel } from '../schema';

export type ApiKeyValidationResult =
  { valid: true; apiKey: ApiKeyModel } | { valid: false; reason: string };

export function checkApiKeyUsable(apiKey: ApiKeyModel | undefined): ApiKeyValidationResult {
  if (apiKey === undefined) {
    return { valid: false, reason: 'Could not find the api key' };
  }

  if (apiKey.expiresAt !== null && !isDateBefore(new Date(), apiKey.expiresAt)) {
    return { valid: false, reason: 'Api key is expired' };
  }

  if (apiKey.state === 'inactive') {
    return { valid: false, reason: 'Api key is inactive' };
  }

  if (apiKey.state === 'deleted') {
    return { valid: false, reason: 'Api key was deleted' };
  }

  return { valid: true, apiKey };
}
