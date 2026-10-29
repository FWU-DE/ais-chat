import { eq, sql } from 'drizzle-orm';
import { db } from '..';
import {
  userSettingsSchema,
  userSettingsSelectSchema,
  userSettingsTable,
  type UserSettings,
} from '../schema';

export async function dbGetUserSettings({ userId }: { userId: string }) {
  const [userSettings] = await db
    .select()
    .from(userSettingsTable)
    .where(eq(userSettingsTable.userId, userId));
  return userSettings === undefined ? undefined : userSettingsSelectSchema.parse(userSettings);
}

export async function dbUpsertUserSettings({
  userId,
  settings,
}: {
  userId: string;
  settings: UserSettings;
}) {
  const parsedSettings = userSettingsSchema.parse(settings);
  const [userSettings] = await db
    .insert(userSettingsTable)
    .values({ userId, settings: parsedSettings })
    .onConflictDoUpdate({
      target: userSettingsTable.userId,
      // Merge with the stored JSON inside the statement so concurrent partial
      // updates cannot overwrite each other's fields.
      set: {
        settings: sql`${userSettingsTable.settings} || ${JSON.stringify(settings)}::jsonb`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return userSettings === undefined ? undefined : userSettingsSelectSchema.parse(userSettings);
}
