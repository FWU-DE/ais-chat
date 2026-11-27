import type { SeverityLevel } from '@sentry/nextjs';

import { BusinessError } from './business-error';

export class UnauthenticatedError extends BusinessError {
  override readonly logLevel: SeverityLevel = 'info';

  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthenticatedError';
  }
}

export function isUnauthenticatedError(error: unknown): error is UnauthenticatedError {
  if (error && typeof error === 'object') {
    return (
      'name' in error &&
      error.name === 'UnauthenticatedError' &&
      'statusCode' in error &&
      error.statusCode === 401
    );
  }
  return false;
}
