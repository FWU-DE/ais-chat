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

export type SyncOutcome = {
  errors: SyncError[];
  /** True if any key or provider was deleted or a deletion was attempted. */
  deleted: boolean;
};

// The core logs response bodies and error objects. Requests carry provider keys, so nothing
// from the core reaches our logs except the message.
const silentLogger: BifrostProviderSyncLogger = {};

function describeError(error: unknown): string {
  if (error instanceof BifrostProviderSyncError) {
    return `Bifrost responded with HTTP ${error.status ?? 'error'}`;
  }
  return error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
}

/**
 * Brings Bifrost to `desired` through one pod. Collects errors per provider. `authoritative`
 * resets provider settings that `desired` omits, so a baseline replaces the failed target. Stale providers are
 * deleted and virtual key access updated only if every provider succeeded, like the direct path.
 */
export async function syncAll(
  target: BifrostTarget,
  desired: BifrostProviderConfig[],
  options: { authoritative?: boolean } = {},
): Promise<SyncOutcome> {
  const connection = {
    bifrostAdminUrl: target.baseUrl,
    bifrostAdminUsername: target.username,
    bifrostAdminPassword: target.password,
  };
  const errors: SyncError[] = [];
  let deleted = false;
  const markDeleted = () => {
    deleted = true;
  };

  for (const providerConfig of desired) {
    try {
      await syncBifrostProvider({
        ...connection,
        providerConfig,
        onKeyDelete: markDeleted,
        authoritative: options.authoritative,
        logger: silentLogger,
      });
    } catch (error) {
      errors.push({
        provider: providerConfig.provider,
        step: 'provider',
        message: describeError(error),
      });
    }
  }
  if (errors.length > 0) return { errors, deleted };

  try {
    await deleteStaleManagedProviders(
      desired,
      { ...connection, logger: silentLogger },
      markDeleted,
    );
  } catch (error) {
    errors.push({ provider: '*', step: 'delete-stale', message: describeError(error) });
    return { errors, deleted };
  }

  try {
    await ensureBifrostVirtualKeyProviderAccess({
      ...connection,
      providerConfigs: desired,
      logger: silentLogger,
    });
  } catch (error) {
    errors.push({ provider: '*', step: 'virtual-keys', message: describeError(error) });
  }
  return { errors, deleted };
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
