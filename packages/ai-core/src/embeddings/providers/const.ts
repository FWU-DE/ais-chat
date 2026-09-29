// Fail fast instead of relying on the SDK default (10 min timeout, 2 retries) which lets
// hanging provider requests pile up in memory during outages.
export const EMBEDDING_CLIENT_TIMEOUT_MS = 15_000;
export const EMBEDDING_CLIENT_MAX_RETRIES = 1;
