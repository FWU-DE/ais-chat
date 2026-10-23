'use client';

import React from 'react';
import { UserSettings } from '@shared/db/schema';

const UserSettingsContext = React.createContext<UserSettings | undefined>(undefined);

export function useUserSettings(): UserSettings | undefined {
  return React.useContext(UserSettingsContext);
}

export function UserSettingsProvider({
  children,
  settings,
}: {
  children: React.ReactNode;
  settings: UserSettings;
}) {
  return <UserSettingsContext value={settings}>{children}</UserSettingsContext>;
}
