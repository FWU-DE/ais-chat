/**
 * @description One-off data-repair migration for TD-1498.
 */
import path from 'node:path';

import { db } from '@shared/db';
import { assistantTable, characterTable } from '@shared/db/schema';
import { logError, logInfo } from '@shared/logging';
import { copyFileInS3 } from '@shared/s3';
import { buildAssistantPictureKey, buildCharacterPictureKey } from '@shared/utils/picture-key';
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';

const LOCK_KEY1 = 1000;
const LOCK_KEY2 = 100003;

/** Ensures the migration only runs on a single pod at a time; other pods wait their turn. */
async function withAdvisoryLock(callback: () => Promise<void>) {
  const client = await db.$client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [LOCK_KEY1, LOCK_KEY2]);
    try {
      await callback();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_KEY1, LOCK_KEY2]);
    }
  } finally {
    client.release();
  }
}

function dbGetAssistantsWithInvalidPictureIds() {
  return db
    .select({ id: assistantTable.id, pictureId: assistantTable.pictureId })
    .from(assistantTable)
    .where(
      and(
        isNotNull(assistantTable.pictureId),
        ne(assistantTable.pictureId, ''),
        sql`${assistantTable.pictureId} NOT LIKE '%' || ${assistantTable.id} || '%'`,
      ),
    );
}

function dbGetCharactersWithInvalidPictureIds() {
  return db
    .select({ id: characterTable.id, pictureId: characterTable.pictureId })
    .from(characterTable)
    .where(
      and(
        isNotNull(characterTable.pictureId),
        ne(characterTable.pictureId, ''),
        sql`${characterTable.pictureId} NOT LIKE '%' || ${characterTable.id} || '%'`,
      ),
    );
}

async function fixAssistantPictureIds() {
  const assistants = await dbGetAssistantsWithInvalidPictureIds();
  if (assistants.length === 0) {
    return;
  }

  logInfo(`Found ${assistants.length} assistants with invalid picture ids.`);

  for (const assistant of assistants) {
    try {
      const oldPictureId = assistant.pictureId;
      if (!oldPictureId) {
        continue;
      }

      const newPictureId = buildAssistantPictureKey(assistant.id, path.basename(oldPictureId));

      try {
        await copyFileInS3({ copySource: oldPictureId, newKey: newPictureId });
      } catch {
        // copyFileInS3 already logs the underlying error; just note which entity needs manual fixing
        logInfo(
          `Could not copy picture ${oldPictureId} for assistant ${assistant.id}, it likely does not exist in S3. Needs manual fixing.`,
        );
        continue;
      }

      const updated = await db
        .update(assistantTable)
        .set({ pictureId: newPictureId })
        .where(and(eq(assistantTable.id, assistant.id), eq(assistantTable.pictureId, oldPictureId)))
        .returning({ id: assistantTable.id });

      if (updated.length === 0) {
        logInfo(`Skipped assistant ${assistant.id}: picture id changed concurrently.`);
        continue;
      }
      logInfo(`Fixed picture id for assistant ${assistant.id}`);
    } catch (error) {
      logError(`Failed to fix invalid picture id for assistant ${assistant.id}`, error);
    }
  }
}

async function fixCharacterPictureIds() {
  const characters = await dbGetCharactersWithInvalidPictureIds();
  if (characters.length === 0) {
    return;
  }

  logInfo(`Found ${characters.length} characters with invalid picture ids.`);

  for (const character of characters) {
    try {
      const oldPictureId = character.pictureId;
      if (!oldPictureId) {
        continue;
      }

      const newPictureId = buildCharacterPictureKey(character.id, path.basename(oldPictureId));

      try {
        await copyFileInS3({ copySource: oldPictureId, newKey: newPictureId });
      } catch {
        // copyFileInS3 already logs the underlying error; just note which entity needs manual fixing
        logInfo(
          `Could not copy picture ${oldPictureId} for character ${character.id}, it likely does not exist in S3. Needs manual fixing.`,
        );
        continue;
      }

      const updated = await db
        .update(characterTable)
        .set({ pictureId: newPictureId })
        .where(and(eq(characterTable.id, character.id), eq(characterTable.pictureId, oldPictureId)))
        .returning({ id: characterTable.id });

      if (updated.length === 0) {
        logInfo(`Skipped character ${character.id}: picture id changed concurrently.`);
        continue;
      }
      logInfo(`Fixed picture id for character ${character.id}`);
    } catch (error) {
      logError(`Failed to fix invalid picture id for character ${character.id}`, error);
    }
  }
}

/**
 * Fixes assistants and characters whose picture ids reference another entity's S3 object,
 * by duplicating the referenced picture into a key scoped to their own id.
 */
export async function fixInvalidPictureIds() {
  await withAdvisoryLock(async () => {
    logInfo('Starting migration to fix invalid picture ids...');
    await fixAssistantPictureIds();
    await fixCharacterPictureIds();
    logInfo('Completed fix for invalid picture ids.');
  });
}
