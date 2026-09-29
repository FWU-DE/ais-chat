'use client';

import { useTheme } from 'next-themes';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';

const isLocalDev = process.env.NODE_ENV === 'development';

export function ThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();

  if (!isLocalDev) {
    return null;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      className="hidden md:flex items-center justify-center size-10 rounded-full hover:bg-secondary/50"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </button>
  );
}
