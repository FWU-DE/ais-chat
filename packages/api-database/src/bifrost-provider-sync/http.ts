import { BifrostProviderSyncError } from './error';
import { BifrostProviderSyncLogger } from './types';

export async function bifrostFetch({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  path,
  init,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  path: string;
  init: RequestInit;
}): Promise<Response> {
  const hasBasicCredentials =
    bifrostAdminUsername !== undefined && bifrostAdminPassword !== undefined;
  const authorizationHeader = hasBasicCredentials
    ? `Basic ${Buffer.from(`${bifrostAdminUsername}:${bifrostAdminPassword}`).toString('base64')}`
    : undefined;

  return fetch(new URL(path, bifrostAdminUrl), {
    ...init,
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
  throw new BifrostProviderSyncError();
}
