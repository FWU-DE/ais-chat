import {
  type BifrostProviderConfig,
  BifrostProviderSyncError,
  type BifrostProviderSyncLogger,
  deleteStaleManagedProviders,
  ensureBifrostVirtualKeyProviderAccess,
  syncBifrostProvider,
} from '@ais-chat/api-database/bifrost-provider-sync/core';

import type { SyncError } from './types';

export type BifrostTarget = { baseUrl: string; username: string; password: string };

// The core logs response bodies and error objects. Requests carry provider keys, so nothing
// from the core reaches our logs except the message we build here.
export const silentLogger: BifrostProviderSyncLogger = {};

export const connectionOf = (target: BifrostTarget) => ({
  bifrostAdminUrl: target.baseUrl,
  bifrostAdminUsername: target.username,
  bifrostAdminPassword: target.password,
});

export function describeError(error: unknown): string {
  if (error instanceof BifrostProviderSyncError) {
    return `Bifrost responded with HTTP ${error.status ?? 'error'}`;
  }
  return error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
}

/**
 * Brings Bifrost to `desired` through one pod. Collects errors per provider. Stale providers are
 * deleted and virtual key access updated only if every provider succeeded, like the direct path.
 */
export async function syncAll(
  target: BifrostTarget,
  desired: BifrostProviderConfig[],
): Promise<SyncError[]> {
  const connection = connectionOf(target);
  const errors: SyncError[] = [];

  for (const providerConfig of desired) {
    try {
      await syncBifrostProvider({ ...connection, providerConfig, logger: silentLogger });
    } catch (error) {
      errors.push({
        provider: providerConfig.provider,
        step: 'provider',
        message: describeError(error),
      });
    }
  }
  if (errors.length > 0) return errors;

  try {
    await deleteStaleManagedProviders(desired, { ...connection, logger: silentLogger });
  } catch (error) {
    return [{ provider: '*', step: 'delete-stale', message: describeError(error) }];
  }

  try {
    await ensureBifrostVirtualKeyProviderAccess({
      ...connection,
      providerConfigs: desired,
      logger: silentLogger,
    });
  } catch (error) {
    return [{ provider: '*', step: 'virtual-keys', message: describeError(error) }];
  }
  return [];
}

/**
 * A pod that cannot load its config stays Ready but answers `GET /api/providers` with 500
 * (missing or wrong encryption key).
 */
export async function providersHealthy(target: BifrostTarget): Promise<boolean> {
  try {
    const response = await fetch(new URL('/api/providers', target.baseUrl), {
      headers: {
        Authorization: `Basic ${Buffer.from(`${target.username}:${target.password}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(20_000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}
