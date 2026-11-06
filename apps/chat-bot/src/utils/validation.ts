import { errorifyFn } from '@shared/utils/error';

import { env } from '@/env';

export const validateApiKeyByHeadersWithResult = errorifyFn(validateApiKeyByHeaders);
export function validateApiKeyByHeaders(headers: Headers) {
  const authorization = headers.get('Authorization')?.toString();

  if (authorization === undefined) {
    throw new Error('Could not get Authorization header');
  }

  const bareApiKey = authorization.substring('Bearer '.length);

  if (bareApiKey !== env.apiKey) {
    throw new Error('Wrong api key');
  }

  return true;
}
