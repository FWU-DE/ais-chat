'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

import { clearSessionStorage } from '@/hooks/use-session-storage-state';

/**
 * Clears sessionStorage and resets cached queries when the user logs in with a new session
 * or logs out, so that per-session state (e.g. dismissed info banners) resets correctly and
 * a session change in another tab cannot expose the previous user's cached data.
 *
 * Placed in the global layout so it also fires on logout, not only within
 * authenticated routes.
 */
export default function SessionClearer() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status === 'loading') return;
    try {
      const stored = sessionStorage.getItem('login_session_id');
      if (status === 'authenticated' && session?.sessionId) {
        if (stored !== session.sessionId) {
          clearSessionStorage();
          sessionStorage.setItem('login_session_id', session.sessionId);
          if (stored !== null) {
            void queryClient.resetQueries();
          }
        }
      } else if (status === 'unauthenticated' && stored !== null) {
        clearSessionStorage();
        void queryClient.resetQueries();
      }
    } catch {
      // Without working storage we cannot tell whether the session changed, so reset to be safe.
      clearSessionStorage();
      void queryClient.resetQueries();
    }
  }, [session?.sessionId, status, queryClient]);

  return null;
}
