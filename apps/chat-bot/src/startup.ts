import { lookupApiKeys } from '@ais-chat/ai-core/api-keys/lookup';
import { env as aiEnv } from '@ais-chat/ai-core/env';
import { runDatabaseMigration, shutdownDatabase } from '@shared/db';
import { decrypt } from '@shared/db/crypto';
import { dbGetFederalStates, dbUpdateFederalState } from '@shared/db/functions/federal-state';
import { env } from '@shared/env';
import { logError, logInfo } from '@shared/logging';
import { shutdownRabbitMQ } from '@shared/rabbitmq';
import { listFilesFromS3 } from '@shared/s3';
import { registerCleanupHandler } from '@shared/shutdown/cleanup';
import { fixInvalidPictureIds } from '@shared/templates/fix-invalid-picture-ids';

/**
 * Custom code that will be executed on application startup.
 */
export async function startup() {
  await runDatabaseMigration();
  await postMigration();

  registerCleanupHandler(shutdownDatabase);
  registerCleanupHandler(shutdownRabbitMQ);
}

/**
 * Performs post-migration operations after database migrations have been executed.
 */
async function postMigration() {
  await tempAddApiKeyIdsToFederalStates();
  await tempAddPictureUrlsToFederalStates();
  // run fix in the background
  void tempFixInvalidPictureIds().catch((error) =>
    logError('Failed to run picture id migration', error),
  );
}

/**
 * Temporary migration function that adds API key IDs to federal states.
 *
 * @AsamMax
 * TODO: delete after executing in production once
 *
 * @returns A promise that resolves when all federal states have been processed
 */
async function tempAddApiKeyIdsToFederalStates() {
  if (!aiEnv.apiDatabaseUrl) {
    return;
  }
  // Get all federal states
  const federalStates = await dbGetFederalStates();

  // Filter states that have encrypted API key but no apiKeyId
  const statesToUpdate = federalStates.filter((state) => state.encryptedApiKey && !state.apiKeyId);

  if (statesToUpdate.length === 0) {
    logInfo('No federal states need API key ID updates');
    return;
  }

  // Decrypt API keys and create lookup dictionary
  const apiKeysByState: Record<string, string> = {};
  for (const state of statesToUpdate) {
    try {
      apiKeysByState[state.id] = decrypt({
        data: state.encryptedApiKey!,
        plainEncryptionKey: env.encryptionKey,
      });
    } catch (error) {
      logError(`Failed to decrypt API key for federal state ${state.id}`, error);
    }
  }

  // Lookup API key IDs
  const apiKeyIdsByState = await lookupApiKeys(apiKeysByState);

  // Update federal states with their API key IDs
  for (const state of statesToUpdate) {
    if (apiKeyIdsByState[state.id]) {
      try {
        await dbUpdateFederalState({
          id: state.id,
          apiKeyId: apiKeyIdsByState[state.id],
        });
        logInfo(`Updated federal state ${state.id} with API key ID ${apiKeyIdsByState[state.id]}`);
      } catch (error) {
        logError(`Failed to update federal state ${state.id}`, error);
      }
    } else {
      logInfo(`No API key ID found for federal state ${state.id}`);
    }
  }

  logInfo(`Completed API key ID updates for ${statesToUpdate.length} federal states`);
}

/**
 * Temporary migration function that fills missing federal state picture URLs from existing S3 whitelabel files.
 */
async function tempAddPictureUrlsToFederalStates() {
  const federalStates = await dbGetFederalStates();
  const statesToUpdate = federalStates.filter((state) => !state.pictureUrls);
  if (!statesToUpdate.length) return;

  const whitelabelFiles = await listFilesFromS3({ prefix: 'whitelabels/' });
  const whitelabelFileSet = new Set(whitelabelFiles);

  for (const state of statesToUpdate) {
    const logoKey = `whitelabels/${state.id}/logo.svg`;
    const faviconKey = `whitelabels/${state.id}/favicon.svg`;

    const currentPictureUrls = state.pictureUrls ?? {};
    const shouldAddLogo = !currentPictureUrls.logo && whitelabelFileSet.has(logoKey);
    const shouldAddFavicon = !currentPictureUrls.favicon && whitelabelFileSet.has(faviconKey);

    try {
      await dbUpdateFederalState({
        id: state.id,
        pictureUrls: {
          ...currentPictureUrls,
          ...(shouldAddLogo ? { logo: logoKey } : {}),
          ...(shouldAddFavicon ? { favicon: faviconKey } : {}),
        },
      });
      logInfo(`Updated picture URLs for federal state ${state.id}`);
    } catch (error) {
      logError(`Failed to update picture URLs for federal state ${state.id}`, error);
    }
  }

  logInfo(`Completed picture URL updates for ${statesToUpdate.length} federal states`);
}

/**
 * Temporary migration that fixes assistants/characters whose picture id still references
 * another entity's S3 object instead of their own (a leftover of missing avatar duplication
 * on template/duplicate creation).
 *
 * TODO: delete after executing in production once
 */
async function tempFixInvalidPictureIds() {
  await fixInvalidPictureIds();
}
