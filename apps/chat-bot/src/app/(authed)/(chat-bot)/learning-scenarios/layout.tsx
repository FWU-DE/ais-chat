import { notFound } from 'next/navigation';

import { requireAuth } from '@/auth/requireAuth';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAuth();

  if (user.userRole !== 'teacher') {
    notFound();
  }

  return <>{children}</>;
}
