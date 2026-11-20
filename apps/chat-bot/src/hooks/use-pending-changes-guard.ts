'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

type NavigationIntent = () => void;

type UsePendingChangesGuardProps = {
  hasPendingChanges: boolean;
  onBeforePageLeave: () => Promise<void>;
};

/**
 * A hook that guards against navigating away from a page with pending changes.
 * In-app navigation goes through `guardNavigation`, which awaits `onBeforePageLeave` first.
 * Browser back/forward is not blocked: `onBeforePageLeave` is triggered on unmount without
 * waiting for it, so the history stack stays untouched.
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

      try {
        await onBeforePageLeave();
      } finally {
        isNavigatingRef.current = false;
        continueNavigation();
      }
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
    return () => {
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
