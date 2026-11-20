import { UserModel, userSchema } from '@shared/auth/user-model';
import { FederalStateModel, federalStateSchema } from '@shared/federal-states/types';
import { headers } from 'next/headers';

import { auth } from '@/auth';

import { redirectToLogin } from './utils';

export async function requireAuth(): Promise<{
  user: UserModel;
  federalState: FederalStateModel;
}> {
  const session = await auth();
  if (!session) {
    const headersList = await headers();
    const pathname = headersList.get('x-pathname') || '/';
    redirectToLogin(pathname);
  }

  const user = userSchema.parse(session.user);
  const federalState = federalStateSchema.parse(session.user?.federalState);
  return { user: user, federalState: federalState };
}
