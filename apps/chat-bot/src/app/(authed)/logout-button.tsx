'use client';

import { useTranslations } from 'next-intl';

import { LogoutIcon } from '@/components/icons/logout';
import { cn } from '@/utils/tailwind';

async function logout() {
  // Full page navigation is required so the browser follows the route handler's redirect after clearing the session cookie.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/api/auth/logout');
}

export default function LogoutButton({ className, ...props }: React.ComponentProps<'button'>) {
  const t = useTranslations('common');

  return (
    <button
      onClick={logout}
      className={cn('flex flex-row gap-2 items-center', className)}
      {...props}
    >
      <LogoutIcon className="w-5 h-5" />
      <p>{t('logout')}</p>
    </button>
  );
}
