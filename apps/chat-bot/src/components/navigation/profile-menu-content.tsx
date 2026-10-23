'use client';

import { type UserAndContext } from '@/auth/types';
import { SettingsMenuItem } from '@/components/settings/settings-dialog';
import { SignOutIcon } from '@phosphor-icons/react';
import { DropdownMenuItem } from '@ui/components/dropdown-menu';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { IMPRESSUM_URL, PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from './const';

async function logout() {
  // Full page navigation is required so the browser follows the route handler's redirect after clearing the session cookie.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/api/auth/logout');
}

export function ProfileMenuContent({
  userAndContext,
  onOpenSettings,
}: {
  userAndContext?: UserAndContext;
  onOpenSettings?: () => void;
}) {
  const tCommon = useTranslations('common');
  const tLegal = useTranslations('legal');

  return (
    <>
      <DropdownMenuItem asChild>
        <Link href={PRIVACY_POLICY_URL} prefetch={false} target="_blank" rel="noopener noreferrer">
          {tLegal('privacy-policy')}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href={IMPRESSUM_URL} prefetch={false} target="_blank" rel="noopener noreferrer">
          {tLegal('imprint')}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href={TERMS_OF_USE_URL} prefetch={false} target="_blank" rel="noopener noreferrer">
          {tLegal('terms-of-use')}
        </Link>
      </DropdownMenuItem>
      {userAndContext !== undefined && (
        <>
          <hr className="border-gray-200 mx-2" />
          {onOpenSettings !== undefined && <SettingsMenuItem onSelect={onOpenSettings} />}
          <DropdownMenuItem key="profile-menu-logout" onSelect={logout} className="text-primary">
            <SignOutIcon />
            {tCommon('logout')}
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
