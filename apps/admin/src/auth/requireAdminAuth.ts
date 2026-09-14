import { auth } from '@/auth';
import type { Session } from 'next-auth';
import * as Sentry from '@sentry/nextjs';
import { ForbiddenError, UnauthenticatedError } from '@shared/error';
import { AdminRole, ADMIN_ROLE, canAccessAdminApp, canAccessEditorArea } from './roles';

// Type for a validated admin session with guaranteed user.name
export type ValidatedSession = Session & {
  user: NonNullable<Session['user']> & {
    name: string;
  };
  adminRole: AdminRole;
};

/**
 * @returns The authenticated session with validated user information
 * @throws UnauthenticatedError if no session found or session is incomplete
 */
export async function requireAdminAuth(): Promise<ValidatedSession> {
  const session = await requireAuthenticatedAdminRole();
  if (session.adminRole !== ADMIN_ROLE) {
    throw new ForbiddenError('The Admin role is required');
  }
  return session;
}

export async function requireAdminOrEditorAuth(): Promise<ValidatedSession> {
  const session = await requireAuthenticatedAdminRole();

  if (!canAccessEditorArea(session.adminRole)) {
    throw new ForbiddenError('The Admin or Editor role is required');
  }

  return session;
}

async function requireAuthenticatedAdminRole(): Promise<ValidatedSession> {
  const session = await auth();
  if (!session?.user?.name) {
    throw new UnauthenticatedError('Authentication required or session incomplete');
  }
  if (!canAccessAdminApp(session.adminRole)) {
    throw new ForbiddenError('An admin role is required');
  }

  // For audit-log reasons, we keep track of all available user information
  Sentry.setUser({
    id: session.user.id,
    email: session.user.email ?? undefined,
    username: session.user.name,
  });

  return session as ValidatedSession;
}
