'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import React, { useEffect } from 'react';

type SessionWatcherProps = {
  /**
   * If set and the session status becomes "unauthenticated", user will be redirected here.
   */
  redirectTo: string;
  children: React.ReactNode;
};

/**
 * Client component that watches next-auth session state and redirects
 * to logout-callback url if user is unauthenticated.
 */
export default function SessionWatcher({ redirectTo, children }: SessionWatcherProps) {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated' && redirectTo) {
      router.push(redirectTo);
    }
  }, [session, status, redirectTo, router]);

  return <>{children}</>;
}
