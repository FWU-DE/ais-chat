import { dbGetUserSettings, dbUpsertUserSettings } from '@shared/db/functions/user-settings';
import type { UserSettings } from '@shared/db/schema';

export async function getUserSettings({ userId }: { userId: string }) {
  const userSettings = await dbGetUserSettings({ userId });
  return userSettings?.settings;
}

export async function updateUserSettings({
  userId,
  settings,
}: {
  userId: string;
  settings: UserSettings;
}) {
  const updatedSettings = await dbUpsertUserSettings({ userId, settings });
  if (!updatedSettings) {
    throw new Error(`Failed to upsert user settings for user ${userId}`);
  }
  return updatedSettings.settings;
}
