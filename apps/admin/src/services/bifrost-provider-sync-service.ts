import { syncBifrostProvidersForOrganization as syncBifrostProvidersForOrganizationInDatabase } from '@ais-chat/api-database/bifrost-provider-sync';
import { isBifrostProviderSyncError } from '@ais-chat/api-database/bifrost-provider-sync/error';
import { env } from '@/consts/env';
import { logError, logInfo, logWarning } from '@shared/logging';
import { InvalidArgumentError } from '@shared/error';

export async function syncBifrostProvidersForOrganization(organizationId: string): Promise<void> {
  await syncBifrostProvidersForOrganizationInDatabase(organizationId, {
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
export async function syncBifrostProvidersForOrganizationOrThrow(
  organizationId: string,
): Promise<void> {
  try {
    await syncBifrostProvidersForOrganization(organizationId);
  } catch (error) {
    if (isBifrostProviderSyncError(error)) {
      throw new InvalidArgumentError('Fehler beim Aktualisieren der Konfiguration in Bifrost');
    }
    throw error;
  }
}
