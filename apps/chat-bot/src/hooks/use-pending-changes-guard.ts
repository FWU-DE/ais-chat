'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

type NavigationIntent = () => void;

type UsePendingChangesGuardProps = {
  hasPendingChanges: boolean;
  /** Resolves to `false` if the pending changes could not be saved. */
  onBeforePageLeave: () => Promise<boolean>;
};

type LeaveSaveResult = 'saved' | 'failed' | 'timeout';

const LEAVE_SAVE_TIMEOUT_MS = 3000;

async function saveWithTimeout(save: () => Promise<boolean>): Promise<LeaveSaveResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), LEAVE_SAVE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      save().then((isSaved) => (isSaved ? ('saved' as const) : ('failed' as const))),
      timeout,
    ]);
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A hook that guards against navigating away from a page with pending changes.
 * In-app navigation goes through `guardNavigation`, which awaits `onBeforePageLeave` first.
 * Browser back/forward is held back while there are pending changes and continues once they
 * are saved. It stays on the page if saving fails and continues if saving takes too long.
 * No history entries are written.
 */
export function usePendingChangesGuard({
  hasPendingChanges,
  onBeforePageLeave,
}: UsePendingChangesGuardProps) {
  const queryClient = useQueryClient();
  const hasPendingChangesRef = useRef(hasPendingChanges);
  const pendingIntentRef = useRef<NavigationIntent | null>(null);
  const onBeforePageLeaveRef = useRef(onBeforePageLeave);
  const isNavigatingRef = useRef(false);
  const bypassNextTraverseRef = useRef(false);

  useEffect(() => {
    hasPendingChangesRef.current = hasPendingChanges;
  }, [hasPendingChanges]);

  useEffect(() => {
    onBeforePageLeaveRef.current = onBeforePageLeave;
  }, [onBeforePageLeave]);

  const continueNavigation = useCallback(() => {
    const navigationIntent = pendingIntentRef.current;
    pendingIntentRef.current = null;
    navigationIntent?.();
  }, []);

  const navigateWithPendingChanges = useCallback(
    async (navigationIntent: NavigationIntent) => {
      if (isNavigatingRef.current) {
        return;
      }

      isNavigatingRef.current = true;
      pendingIntentRef.current = navigationIntent;

      const result = await saveWithTimeout(onBeforePageLeave);
      isNavigatingRef.current = false;

      if (result === 'failed') {
        pendingIntentRef.current = null;
        return;
      }

      continueNavigation();
    },
    [continueNavigation, onBeforePageLeave],
  );

  const guardNavigation = useCallback(
    (navigationIntent: NavigationIntent) => {
      if (!hasPendingChangesRef.current) {
        navigationIntent();
        return;
      }

      void navigateWithPendingChanges(navigationIntent);
    },
    [navigateWithPendingChanges],
  );

  useEffect(() => {
    if (!('navigation' in window)) {
      return;
    }

    const navigation = window.navigation;
    const onNavigate = (event: NavigateEvent) => {
      if (event.navigationType !== 'traverse') {
        return;
      }

      if (bypassNextTraverseRef.current) {
        bypassNextTraverseRef.current = false;
        return;
      }

      const destinationKey = event.destination.key;
      if (
        !event.cancelable ||
        !destinationKey ||
        !hasPendingChangesRef.current ||
        isNavigatingRef.current
      ) {
        return;
      }

      event.preventDefault();
      isNavigatingRef.current = true;
      void saveWithTimeout(() => onBeforePageLeaveRef.current()).then((result) => {
        isNavigatingRef.current = false;
        if (result === 'failed') {
          return;
        }

        bypassNextTraverseRef.current = true;
        navigation.traverseTo(destinationKey);
      });
    };

    navigation.addEventListener('navigate', onNavigate);
    return () => {
      navigation.removeEventListener('navigate', onNavigate);
    };
  }, []);

  useEffect(() => {
    return () => {
      // Fallback for traversals that cannot be held back (e.g. a repeated back press, or
      // browsers without the Navigation API, such as Safari before 26.2).
      if (hasPendingChangesRef.current) {
        // the overview may have loaded before the save finished
        void onBeforePageLeaveRef
          .current()
          .finally(() => queryClient.invalidateQueries({ queryKey: ['entity-overview'] }));
      }
    };
  }, [queryClient]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingChangesRef.current) {
        return;
      }

      event.preventDefault();
      // some older browsers require returnValue to be set, so we ignore the deprecation warning
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  return {
    guardNavigation,
  };
}
