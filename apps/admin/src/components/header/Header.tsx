import { Button } from '@ui/components/button';
import Link from 'next/link';

import { auth } from '@/auth';

import { ROUTES } from '../../consts/routes';
import { SignOutButton } from '../authentication/SignOutButton';

export async function Header() {
  const session = await auth();

  return (
    <header className="flex gap-6 items-center">
      <Button variant="link" className="flex-none text-xl font-bold" asChild>
        <Link href={ROUTES.home}>AIS.chat-admin</Link>
      </Button>
      <div className="flex-1 flex flex-row gap-4">
        {session?.adminRole === 'Admin' && (
          <Button variant="link" asChild>
            <Link href={ROUTES.api.llms}>AIS.chat-api</Link>
          </Button>
        )}
        <Button variant="link" asChild>
          <Link href={ROUTES.app.page}>AIS.chat-app</Link>
        </Button>
      </div>
      {session?.adminRole && (
        <span className="text-sm text-stone-500">Rolle: {session.adminRole}</span>
      )}
      <div className="flex-none">
        <SignOutButton />
      </div>
    </header>
  );
}
