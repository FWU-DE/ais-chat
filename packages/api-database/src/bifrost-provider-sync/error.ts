export const BIFROST_PROVIDER_SYNC_ERROR_CODE = 'BIFROST_PROVIDER_SYNC_FAILED';

export class BifrostProviderSyncError extends Error {
  /** HTTP status of the failed Bifrost request. The response body is deliberately not kept. */
  readonly status?: number;

  constructor(status?: number) {
    super(BIFROST_PROVIDER_SYNC_ERROR_CODE);
    this.name = 'BifrostProviderSyncError';
    this.status = status;
  }
}

export function isBifrostProviderSyncError(error: unknown): error is Error {
  return error instanceof Error && error.message === BIFROST_PROVIDER_SYNC_ERROR_CODE;
}
