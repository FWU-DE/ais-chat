import { dbGetUserAndFederalStateByUserId } from '@shared/db/functions/school';
import { FederalStateSelectModel } from '@shared/db/schema';
import { FederalStateModel } from '@shared/federal-states/types';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type Session } from 'next-auth';

import { auth, unstable_update } from '.';
import { getSafeCallbackUrl } from './callback-url';
import { type UserAndContext } from './types';

export { getSafeCallbackUrl };

export async function getValidSession(): Promise<Session> {
  const session = await auth();

  if (session === null) {
    const headersList = await headers();
    const pathname = headersList.get('x-pathname') || '/';
    redirectToLogin(pathname);
  }

  return session;
}

/**
 * Redirects unauthenticated users to login, preserving the current path as callbackUrl.
 */
export function redirectToLogin(pathname: string): never {
  if (pathname === '/' || pathname.startsWith('/login')) {
    redirect('/login');
  }

  const callbackUrl = encodeURIComponent(getSafeCallbackUrl(pathname));
  redirect(`/login?callbackUrl=${callbackUrl}`);
}

export async function getMaybeSession(): Promise<Session | null> {
  const session = await auth();

  return session;
}

export async function getMaybeUser() {
  const session = await auth();
  const user = session?.user;

  if (user === undefined) return null;

  return user;
}

export async function getUser(): Promise<UserAndContext> {
  const session = await getValidSession();

  if (session.user === undefined) {
    redirect('/api/auth/logout');
  }

  return session.user;
}

export async function userHasCompletedTraining(): Promise<boolean> {
  const session = await getMaybeSession();
  return session?.hasCompletedTraining ?? false;
}

export async function updateSession(
  data?: Partial<
    | Session
    | {
        user: Partial<Session['user']>;
      }
  >,
): Promise<void> {
  await unstable_update(data ?? {});
}

export async function getUserAndContextByUserId({
  userId,
}: {
  userId: string;
}): Promise<UserAndContext> {
  const userAndContext = await dbGetUserAndFederalStateByUserId({
    userId,
  });

  // we make sure that the user has a federal state assigned, because this is required for the app to work
  //  and if this is not the case, something went wrong during the login process or misconfiguration in vidis.
  if (userAndContext === undefined || userAndContext.user.federalStateId === null) {
    throw new Error('Could not extract the user and federal state for the user');
  }

  return {
    ...userAndContext.user,
    federalStateId: userAndContext.user.federalStateId,
    federalState: {
      ...obscureFederalState(userAndContext.federalState),
      hasApiKeyAssigned: !!userAndContext.federalState.encryptedApiKey,
    },
  };
}

function obscureFederalState(federalState: FederalStateSelectModel) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { encryptedApiKey, apiKeyId, ...rest } = federalState;

  return rest;
}
export type ObscuredFederalState = Omit<FederalStateModel, 'apiKeyId'>;
