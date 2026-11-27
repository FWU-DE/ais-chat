import type { SeverityLevel } from '@sentry/nextjs';

import { BusinessError } from './business-error';

export class NotFoundError extends BusinessError {
  override readonly logLevel: SeverityLevel = 'info';

  constructor(message = 'Not Found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  if (error && typeof error === 'object') {
    return (
      'name' in error &&
      error.name === 'NotFoundError' &&
      'statusCode' in error &&
      error.statusCode === 404
    );
  }
  return false;
}
