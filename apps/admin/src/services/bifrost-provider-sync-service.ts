import { syncAllBifrostProviders } from '@ais-chat/api-database/bifrost-provider-sync';
import { isBifrostProviderSyncError } from '@ais-chat/api-database/bifrost-provider-sync/error';
import { env } from '@/consts/env';
import { logError, logInfo, logWarning } from '@shared/logging';
import { InvalidArgumentError } from '@shared/error';

export async function syncBifrostProviders(): Promise<void> {
  await syncAllBifrostProviders({
    bifrostAdminUrl: env.bifrostAdminUrl,
    bifrostAdminUsername: env.bifrostAdminUsername,
    bifrostAdminPassword: env.bifrostAdminPassword,
    logger: {
      info: logInfo,
      warning: logWarning,
      error: logError,
    },
  });
}

/**
 * Runs the Bifrost sync and maps a Bifrost sync failure to a user-facing
 * error so it surfaces through runServerAction instead of a generic error.
 */
export async function syncBifrostProvidersOrThrow(): Promise<void> {
  try {
    await syncBifrostProviders();
  } catch (error) {
    if (isBifrostProviderSyncError(error)) {
      throw new InvalidArgumentError('Fehler beim Aktualisieren der Konfiguration in Bifrost');
    }
    throw error;
  }
}
