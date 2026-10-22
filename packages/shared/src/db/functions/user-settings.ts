import { eq } from 'drizzle-orm';
import { db } from '..';
import { userSettingsTable, type UserSettings } from '../schema';

export async function dbGetUserSettings({ userId }: { userId: string }) {
  const [userSettings] = await db
    .select()
    .from(userSettingsTable)
    .where(eq(userSettingsTable.userId, userId));
  return userSettings;
}

export async function dbUpsertUserSettings({
  userId,
  settings,
}: {
  userId: string;
  settings: UserSettings;
}) {
  const [userSettings] = await db
    .insert(userSettingsTable)
    .values({ userId, settings })
    .onConflictDoUpdate({
      target: userSettingsTable.userId,
      set: { settings, updatedAt: new Date() },
    })
    .returning();
  return userSettings;
}
