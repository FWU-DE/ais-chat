import { dbGetUserSettings, dbUpsertUserSettings } from '@shared/db/functions/user-settings';
import { userSettingsSchema, type UserSettings } from '@shared/db/schema';

/**
 * Returns the settings of a user. The stored JSON bag is parsed on read so
 * that unknown or corrupted fields cannot leak into the UI. Returns undefined
 * when the user has not stored any settings yet.
 */
export async function getUserSettings({ userId }: { userId: string }) {
  const userSettings = await dbGetUserSettings({ userId });
  if (!userSettings) return undefined;

  const parsedSettings = userSettingsSchema.safeParse(userSettings.settings);
  return parsedSettings.success ? parsedSettings.data : undefined;
}

export async function updateUserSettings({
  userId,
  settings,
}: {
  userId: string;
  settings: UserSettings;
}) {
  const parsedSettings = userSettingsSchema.parse(settings);

  const updatedSettings = await dbUpsertUserSettings({ userId, settings: parsedSettings });
  if (!updatedSettings) {
    throw new Error(`Failed to upsert user settings for user ${userId}`);
  }
  return userSettingsSchema.parse(updatedSettings.settings);
}
