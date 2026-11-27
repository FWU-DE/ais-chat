import { BifrostProviderSyncError } from './error';
import { BifrostProviderSyncLogger } from './types';

/**
 * Limit for one request including the read of its body. Not measured: the slowest call is
 * probably creating a provider, where Bifrost resolves the host.
 */
export const BIFROST_REQUEST_TIMEOUT_MS = 30_000;

export async function bifrostFetch({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  path,
  init,
  timeoutMs = BIFROST_REQUEST_TIMEOUT_MS,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  path: string;
  init: RequestInit;
  timeoutMs?: number;
}): Promise<Response> {
  const hasBasicCredentials =
    bifrostAdminUsername !== undefined && bifrostAdminPassword !== undefined;
  const authorizationHeader = hasBasicCredentials
    ? `Basic ${Buffer.from(`${bifrostAdminUsername}:${bifrostAdminPassword}`).toString('base64')}`
    : undefined;

  // The signal stays attached to the response: it also aborts a body that stops mid-stream.
  // A `Promise.race` would leave the request running.
  const timeout = AbortSignal.timeout(timeoutMs);
  return fetch(new URL(path, bifrostAdminUrl), {
    ...init,
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    headers: {
      'Content-Type': 'application/json',
      ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
      ...init.headers,
    },
  });
}

export async function assertBifrostResponse(
  responsePromise: Promise<Response>,
  logger?: BifrostProviderSyncLogger,
): Promise<Response> {
  const response = await responsePromise;
  if (response.ok) return response;

  const responseText = await response.text();
  logger?.error?.('Bifrost provider sync request failed', undefined, {
    status: response.status,
    response: responseText,
  });
  throw new BifrostProviderSyncError(response.status);
}
