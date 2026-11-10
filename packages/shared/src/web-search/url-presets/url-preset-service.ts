import { db } from '@shared/db';
import { urlPresetTable } from '@shared/db/schema';

import { UrlPreset } from './types';

/**
 * Retrieves all URL presets from the database, ordered by orderNumber and name.
 *
 * @returns array of UrlPreset objects
 */
export async function getAllUrlPresets(): Promise<UrlPreset[]> {
  const presets = await db
    .select()
    .from(urlPresetTable)
    .orderBy(urlPresetTable.orderNumber, urlPresetTable.name);
  return presets;
}
