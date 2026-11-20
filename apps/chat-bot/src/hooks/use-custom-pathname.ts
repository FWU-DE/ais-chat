import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import {
  getPathnameSnapshot,
  subscribeToPathnameStore,
  syncPathnameWithNextPathname,
} from '@/utils/navigation/pathname-store';

/**
 * We need this custom hook because Next.js's `usePathname` does not trigger
 * updates when the URL changes via `window.history` API (e.g., `navigateWithoutRefresh`).
 * This is needed when we start a new chat with the first message.
 * In this case a history item is created and should be selected automatically.
 * This is not the case if we use 'usePathname' from 'next/navigation' only,
 * so we sync through a shared pathname store that also listens to history updates.
 * @returns The current pathname.
 */
export function useCustomPathname() {
  const nextPathname = usePathname();

  // Keep the shared store in sync with Next.js router navigations.
  useEffect(() => {
    syncPathnameWithNextPathname(nextPathname);
  }, [nextPathname]);

  const pathname = useSyncExternalStore(
    subscribeToPathnameStore,
    getPathnameSnapshot,
    () => nextPathname, // window.location.pathname is empty string on server, so we return nextPathname
  );

  return pathname;
}
