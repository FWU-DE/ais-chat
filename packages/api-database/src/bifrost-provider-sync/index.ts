import { dbGetAllProviderKeysWithModels, type LlmProviderKeyWithModels } from '../functions';
import { deleteBifrostProvider, listBifrostProviders, syncBifrostProvider } from './client';
import { BifrostProviderSyncError } from './error';
import { buildBifrostProviderConfigs } from './provider-config-builder';
import { type BifrostProviderConfig, type BifrostProviderSyncOptions } from './types';
import { ensureBifrostVirtualKeyProviderAccess } from './virtual-key-sync';

/**
 * Mirrors API DB model/provider configuration into Bifrost.
 *
 * Deleted models are intentionally ignored: they remain in the DB for history/admin
 * visibility but should not be synced to Bifrost.
 */
export async function syncBifrostProviders(
  providerKeys: LlmProviderKeyWithModels[],
  options: BifrostProviderSyncOptions,
): Promise<void> {
  const { bifrostAdminUrl, bifrostAdminUsername, bifrostAdminPassword, logger } = options;
  if (!bifrostAdminUrl) {
    logger?.info?.('Bifrost provider sync skipped because BIFROST_ADMIN_URL is not configured');
    return;
  }

  const providerConfigs = buildBifrostProviderConfigs(providerKeys, logger);

  const failedProviders: string[] = [];

  for (const providerConfig of providerConfigs) {
    try {
      await syncBifrostProvider({
        bifrostAdminUrl,
        bifrostAdminUsername,
        bifrostAdminPassword,
        providerConfig,
        logger,
      });
    } catch (error) {
      failedProviders.push(providerConfig.provider);
      logger?.error?.('Error syncing Bifrost provider', error, {
        provider: providerConfig.provider,
      });
    }
  }

  if (failedProviders.length > 0) {
    logger?.error?.('Error syncing Bifrost providers', undefined, {
      providers: failedProviders,
    });
    throw new BifrostProviderSyncError();
  }

  await deleteStaleManagedProviders(providerConfigs, options);

  await ensureBifrostVirtualKeyProviderAccess({
    bifrostAdminUrl,
    bifrostAdminUsername,
    bifrostAdminPassword,
    logger,
  });
}

/**
 * Deletes providers from Bifrost once they have no more provider keys in the DB.
 *
 * Fetches the actual providers configured in Bifrost rather than relying on a static list, so
 * any provider not currently configured by ais-chat-admin gets removed.
 */
async function deleteStaleManagedProviders(
  providerConfigs: BifrostProviderConfig[],
  options: BifrostProviderSyncOptions,
): Promise<void> {
  const configuredProviders = new Set<string>(providerConfigs.map(({ provider }) => provider));
  const existingProviders = await listBifrostProviders({
    bifrostAdminUrl: options.bifrostAdminUrl!,
    bifrostAdminUsername: options.bifrostAdminUsername,
    bifrostAdminPassword: options.bifrostAdminPassword,
    logger: options.logger,
  });

  const staleProviders = existingProviders
    .map(({ name }) => name)
    .filter((provider): provider is string => !!provider && !configuredProviders.has(provider));

  for (const provider of staleProviders) {
    await deleteBifrostProvider({
      bifrostAdminUrl: options.bifrostAdminUrl!,
      bifrostAdminUsername: options.bifrostAdminUsername,
      bifrostAdminPassword: options.bifrostAdminPassword,
      provider,
      logger: options.logger,
    });
  }
}

export async function syncAllBifrostProviders(options: BifrostProviderSyncOptions): Promise<void> {
  await syncBifrostProviders(await dbGetAllProviderKeysWithModels(), options);
}

export * from './error';
export { buildBifrostProviderConfigs } from './provider-config-builder';
export * from './types';
export { ensureBifrostVirtualKeyProviderAccess } from './virtual-key-sync';
