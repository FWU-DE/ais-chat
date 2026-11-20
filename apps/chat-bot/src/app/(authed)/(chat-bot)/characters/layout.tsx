import { notFound } from 'next/navigation';

import { getUser } from '@/auth/utils';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  if (user.userRole !== 'teacher') {
    notFound();
  }

  return <>{children}</>;
}
