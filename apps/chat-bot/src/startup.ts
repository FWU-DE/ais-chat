import { runDatabaseMigration, shutdownDatabase } from '@shared/db';
import { dbGetFederalStates, dbUpdateFederalState } from '@shared/db/functions/federal-state';
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
  await tempAddPictureUrlsToFederalStates();
  // run fix in the background
  void tempFixInvalidPictureIds().catch((error) =>
    logError('Failed to run picture id migration', error),
  );
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
