import type { SeverityLevel } from '@sentry/nextjs';

export abstract class BusinessError extends Error {
  statusCode: number;
  /** Level used when this error is logged by server action handlers. */
  readonly logLevel: SeverityLevel = 'error';

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'BusinessError';
    this.statusCode = statusCode;
  }
}
