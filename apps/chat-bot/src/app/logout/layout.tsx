import React from 'react';

import { getUser } from '@/auth/utils';

export default async function Layout({ children }: { children: React.ReactNode }) {
  await getUser();

  return <>{children}</>;
}
