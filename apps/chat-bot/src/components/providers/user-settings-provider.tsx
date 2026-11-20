'use client';

import { SpeechVoice, UserSettings } from '@shared/db/schema';
import React from 'react';

type UserSettingsContextProps = {
  settings: UserSettings;
  setSettings: (settings: UserSettings) => void;
  speechVoices: SpeechVoice[];
};

const UserSettingsContext = React.createContext<UserSettingsContextProps | undefined>(undefined);

export function useUserSettings(): UserSettingsContextProps {
  const context = React.useContext(UserSettingsContext);
  if (!context) {
    throw new Error('useUserSettings must be used within a UserSettingsProvider');
  }
  return context;
}

export function UserSettingsProvider({
  children,
  settings: initialSettings,
  speechVoices,
}: {
  children: React.ReactNode;
  settings: UserSettings;
  speechVoices: SpeechVoice[];
}) {
  const [settings, setSettings] = React.useState<UserSettings>(initialSettings);

  return (
    <UserSettingsContext value={{ settings, setSettings, speechVoices }}>
      {children}
    </UserSettingsContext>
  );
}
