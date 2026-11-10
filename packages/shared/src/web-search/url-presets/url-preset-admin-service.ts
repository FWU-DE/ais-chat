import { db } from '@shared/db';
import { urlPresetTable } from '@shared/db/schema';
import { NotFoundError } from '@shared/error';
import { eq } from 'drizzle-orm';

import { UrlPreset, UrlPresetInsert, UrlPresetUpdate } from './types';

export async function getUrlPresetById(id: string): Promise<UrlPreset> {
  const [preset] = await db.select().from(urlPresetTable).where(eq(urlPresetTable.id, id));
  if (!preset) {
    throw new NotFoundError(`UrlPreset with id ${id} not found`);
  }
  return preset;
}

export async function insertUrlPreset(data: UrlPresetInsert): Promise<UrlPreset> {
  const [newPreset] = await db.insert(urlPresetTable).values(data).returning();
  if (!newPreset) {
    throw new Error('Failed to insert UrlPreset');
  }
  return newPreset;
}

export async function updateUrlPreset(id: string, data: UrlPresetUpdate): Promise<UrlPreset> {
  const [updatedPreset] = await db
    .update(urlPresetTable)
    .set(data)
    .where(eq(urlPresetTable.id, id))
    .returning();
  if (!updatedPreset) {
    throw new NotFoundError(`Failed to update UrlPreset with id ${id}`);
  }
  return updatedPreset;
}

export async function deleteUrlPreset(id: string): Promise<void> {
  const result = await db.delete(urlPresetTable).where(eq(urlPresetTable.id, id)).execute();
  if (result.rowCount !== 1) {
    throw new NotFoundError(`UrlPreset with id ${id} not found`);
  }
}
