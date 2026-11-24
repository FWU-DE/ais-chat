import { deleteBifrostProvider, listBifrostProviders } from './client';
import type { BifrostProviderConfig, BifrostProviderSyncOptions } from './types';

/**
 * Deletes providers from Bifrost once they have no more provider keys in the DB.
 *
 * Fetches the actual providers configured in Bifrost rather than relying on a static list, so
 * any provider not currently configured by ais-chat-admin gets removed.
 */
export async function deleteStaleManagedProviders(
  providerConfigs: BifrostProviderConfig[],
  options: BifrostProviderSyncOptions,
  /** Called before each provider deletion request. */
  onProviderDelete?: () => void,
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
    onProviderDelete?.();
    await deleteBifrostProvider({
      bifrostAdminUrl: options.bifrostAdminUrl!,
      bifrostAdminUsername: options.bifrostAdminUsername,
      bifrostAdminPassword: options.bifrostAdminPassword,
      provider,
      logger: options.logger,
    });
  }
}
