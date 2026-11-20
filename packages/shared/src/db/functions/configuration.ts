import { eq } from 'drizzle-orm';

import { db } from '..';
import { configurationTable, type ConfigurationValue } from '../schema';

export async function dbGetConfiguration(key: string) {
  const [configuration] = await db
    .select()
    .from(configurationTable)
    .where(eq(configurationTable.key, key))
    .$withCache();
  return configuration;
}

export async function dbUpsertConfiguration({
  key,
  value,
}: {
  key: string;
  value: ConfigurationValue;
}) {
  const [configuration] = await db
    .insert(configurationTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: configurationTable.key, set: { value } })
    .returning();
  return configuration;
}
