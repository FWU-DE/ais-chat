import { dbGetAllProviderKeysWithModels } from '../functions';
import { BifrostProviderSyncError } from './error';
import { buildBifrostProviderConfigs } from './provider-config-builder';
import {
  BIFROST_PROVIDERS,
  BifrostProviderSyncLogger,
  BifrostVirtualKeyProviderConfig,
} from './types';
import { listBifrostVirtualKeys, updateBifrostVirtualKeyProviders } from './virtual-key-client';
import type { BifrostVirtualKey } from './types';

const NATIVE_BIFROST_PROVIDERS = new Set<string>(BIFROST_PROVIDERS);

/**
 * Ensures every Bifrost virtual key can access the providers/models we currently sync.
 *
 * Virtual keys are deny-by-default: a virtual key with no matching provider config for a given
 * provider is rejected with a 403 when used against that provider. Since virtual keys are shared
 * across organizations, this always computes the desired provider access from *all*
 * organizations' active models (not just the organization that triggered the current sync),
 * so syncing one organization's models can't narrow another organization's provider access.
 *
 * Provider configs for providers not in `BIFROST_PROVIDERS` are left untouched here. Model
 * lists are explicit (not `"*"`) so access doesn't depend on Bifrost's Model Catalog /
 * list-models sync, which can fail for custom or mocked providers.
 *
 * Note: `deleteStaleManagedProviders` (in `index.ts`) can remove a provider from Bifrost
 * entirely if it isn't currently configured, regardless of `BIFROST_PROVIDERS` membership -
 * this function only concerns itself with virtual keys' `provider_configs` entries.
 */
export async function ensureBifrostVirtualKeyProviderAccess({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  logger?: BifrostProviderSyncLogger;
}): Promise<void> {
  const providerConfigs = buildBifrostProviderConfigs(
    await dbGetAllProviderKeysWithModels(),
    logger,
  );

  const allowedModelsByProvider = new Map<string, string[]>(
    providerConfigs.map((providerConfig) => [
      providerConfig.provider,
      [...new Set(providerConfig.keys.flatMap((key) => key.models))],
    ]),
  );

  const managedProviders = new Set<string>([
    ...NATIVE_BIFROST_PROVIDERS,
    ...allowedModelsByProvider.keys(),
  ]);

  const virtualKeys = await listBifrostVirtualKeys({
    bifrostAdminUrl,
    bifrostAdminUsername,
    bifrostAdminPassword,
    logger,
  });

  const failedVirtualKeyIds: string[] = [];

  for (const virtualKey of virtualKeys) {
    try {
      await syncVirtualKeyProviderAccess({
        bifrostAdminUrl,
        bifrostAdminUsername,
        bifrostAdminPassword,
        virtualKey,
        allowedModelsByProvider,
        managedProviders,
        logger,
      });
    } catch (error) {
      failedVirtualKeyIds.push(virtualKey.id);
      logger?.error?.('Error syncing Bifrost virtual key provider access', error, {
        virtualKeyId: virtualKey.id,
      });
    }
  }

  if (failedVirtualKeyIds.length > 0) {
    logger?.error?.('Error syncing Bifrost virtual key provider access', undefined, {
      virtualKeyIds: failedVirtualKeyIds,
    });
    throw new BifrostProviderSyncError();
  }
}

async function syncVirtualKeyProviderAccess({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  virtualKey,
  allowedModelsByProvider,
  managedProviders,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  virtualKey: BifrostVirtualKey;
  allowedModelsByProvider: Map<string, string[]>;
  managedProviders: Set<string>;
  logger?: BifrostProviderSyncLogger;
}): Promise<void> {
  const managedProviderConfigs = buildManagedProviderConfigs(virtualKey, allowedModelsByProvider);
  const existingManagedProviderConfigs = virtualKey.provider_configs.filter((providerConfig) =>
    managedProviders.has(providerConfig.provider),
  );

  if (haveEqualProviderAccess(managedProviderConfigs, existingManagedProviderConfigs)) {
    return;
  }

  const untouchedProviderConfigs = virtualKey.provider_configs.filter(
    (providerConfig) => !managedProviders.has(providerConfig.provider),
  );

  await updateBifrostVirtualKeyProviders({
    bifrostAdminUrl,
    bifrostAdminUsername,
    bifrostAdminPassword,
    virtualKeyId: virtualKey.id,
    providerConfigs: [...untouchedProviderConfigs, ...managedProviderConfigs],
    logger,
  });
}

function buildManagedProviderConfigs(
  virtualKey: BifrostVirtualKey,
  allowedModelsByProvider: Map<string, string[]>,
): BifrostVirtualKeyProviderConfig[] {
  return [...allowedModelsByProvider.entries()].map(([provider, allowedModels]) => {
    const existingProviderConfig = virtualKey.provider_configs.find(
      (providerConfig) => providerConfig.provider === provider,
    );

    return {
      ...existingProviderConfig,
      provider,
      allowed_models: allowedModels,
      key_ids: ['*'],
    };
  });
}

function haveEqualProviderAccess(
  a: BifrostVirtualKeyProviderConfig[],
  b: BifrostVirtualKeyProviderConfig[],
): boolean {
  if (a.length !== b.length) return false;

  const sortedA = [...a].sort((x, y) => x.provider.localeCompare(y.provider));
  const sortedB = [...b].sort((x, y) => x.provider.localeCompare(y.provider));

  return sortedA.every((configA, index) => {
    const configB = sortedB[index]!;
    return (
      configA.provider === configB.provider &&
      haveSameElements(configA.allowed_models, configB.allowed_models) &&
      haveSameElements(configA.key_ids ?? [], configB.key_ids ?? [])
    );
  });
}

function haveSameElements(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}
