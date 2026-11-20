'use client';

import { logDebug, logWarning } from '@shared/logging';
import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import { useEffect, useRef } from 'react';

const SESSION_ENDPOINT = '/api/auth/session';

type ResilientSessionProviderProps = {
  children: React.ReactNode;
  session: Session | null;
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
};

/**
 * Wrapper around NextAuth's SessionProvider that intercepts session fetch
 * requests and caches the last valid session to prevent logout on network errors.
 *
 * When the session endpoint fails (network error, 5xx), returns the cached
 * session instead of null, keeping NextAuth in 'authenticated' state so its
 * internal polling continues working.
 */
export default function ResilientSessionProvider({
  children,
  session,
  refetchInterval,
  refetchOnWindowFocus,
}: ResilientSessionProviderProps) {
  const lastValidSessionRef = useRef<Session | null>(session);
  const originalFetchRef = useRef<typeof fetch | null>(null);
  const wrappedFetchRef = useRef<typeof fetch | null>(null);

  useEffect(() => {
    // Store original fetch if not already stored
    if (!originalFetchRef.current) {
      originalFetchRef.current = window.fetch;
    }

    const originalFetch = originalFetchRef.current;
    if (!originalFetch) {
      throw new Error('ResilientSessionProvider: original fetch not available');
    }

    // Intercept fetch for session endpoint
    const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      // Only intercept session endpoint requests (exact match on pathname)
      const isSessionEndpoint =
        url === SESSION_ENDPOINT ||
        new URL(url, window.location.origin).pathname === SESSION_ENDPOINT;

      if (!isSessionEndpoint) {
        return originalFetch(input, init);
      }

      try {
        const response = await originalFetch(input, init);

        // If successful, parse and cache the session
        if (response.ok) {
          const clonedResponse = response.clone();
          try {
            const data = await clonedResponse.json();

            if (data && typeof data === 'object' && Object.keys(data).length > 0) {
              // Valid session - cache it
              lastValidSessionRef.current = data as Session;
              logDebug('Session fetched successfully - cached');
            } else {
              // Genuine logout (empty session) - clear cache
              lastValidSessionRef.current = null;
              logDebug('Session cleared (genuine logout)');
            }
          } catch {
            // JSON parse error - ignore
          }
          return response;
        }

        // 5xx response - transient infrastructure error
        if (response.status >= 500) {
          logWarning('Session endpoint returned server error - using cached session', {
            status: response.status,
          });

          if (lastValidSessionRef.current) {
            return new Response(JSON.stringify(lastValidSessionRef.current), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        // 4xx or no cached session - allow the error to propagate
        return response;
      } catch (error) {
        // Network error (fetch failed)
        logWarning('Session endpoint unreachable - using cached session', { error });

        if (lastValidSessionRef.current) {
          // Return cached session to prevent logout
          return new Response(JSON.stringify(lastValidSessionRef.current), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // No cached session - rethrow error
        throw error;
      }
    };

    wrappedFetchRef.current = wrappedFetch;
    window.fetch = wrappedFetch;

    // Cleanup: restore original fetch only if window.fetch is still our wrapper
    return () => {
      if (originalFetchRef.current && window.fetch === wrappedFetchRef.current) {
        window.fetch = originalFetchRef.current;
      }
    };
  }, []);

  return (
    <SessionProvider
      session={session}
      refetchInterval={refetchInterval}
      refetchOnWindowFocus={refetchOnWindowFocus}
    >
      {children}
    </SessionProvider>
  );
}
