import type { SeverityLevel } from '@sentry/nextjs';

import { BusinessError } from './business-error';

export class ForbiddenError extends BusinessError {
  override readonly logLevel: SeverityLevel = 'info';

  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export function isForbiddenError(error: unknown): error is ForbiddenError {
  if (error && typeof error === 'object') {
    return (
      'name' in error &&
      error.name === 'ForbiddenError' &&
      'statusCode' in error &&
      error.statusCode === 403
    );
  }
  return false;
}
