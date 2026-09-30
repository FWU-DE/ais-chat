'use client';

import { useTheme } from 'next-themes';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';

const isLocalDev = process.env.NODE_ENV === 'development';

export function ThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();

  if (!isLocalDev) {
    return null;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-round"
      className="hidden md:flex"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </Button>
  );
}
