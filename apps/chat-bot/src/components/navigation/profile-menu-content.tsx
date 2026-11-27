'use client';

import { CoinsIcon, SignOutIcon } from '@phosphor-icons/react';
import { DropdownMenuItem } from '@ui/components/dropdown-menu';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { type UserAndContext } from '@/auth/types';
import { SettingsMenuItem } from '@/components/settings/settings-dialog';

import { IMPRESSUM_URL, PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from './const';

async function logout() {
  // Full page navigation is required so the browser follows the route handler's redirect after clearing the session cookie.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/api/auth/logout');
}

export function ProfileMenuContent({
  userAndContext,
  onOpenSettings,
  onOpenTokenVolume,
}: {
  userAndContext?: UserAndContext;
  onOpenSettings?: () => void;
  onOpenTokenVolume?: () => void;
}) {
  const tCommon = useTranslations('common');
  const tLegal = useTranslations('legal');
  const tTokenVolume = useTranslations('token-volume');

  return (
    <>
      {userAndContext !== undefined && (
        <>
          {onOpenTokenVolume !== undefined && (
            <DropdownMenuItem
              key="profile-menu-token-volume"
              onSelect={onOpenTokenVolume}
              className="text-primary"
            >
              <CoinsIcon />
              {tTokenVolume('menu-label')}
            </DropdownMenuItem>
          )}
          {onOpenSettings !== undefined && <SettingsMenuItem onSelect={onOpenSettings} />}
          <DropdownMenuItem key="profile-menu-logout" onSelect={logout} className="text-primary">
            <SignOutIcon />
            {tCommon('logout')}
          </DropdownMenuItem>
          <hr className="border-gray-200 mx-2" />
        </>
      )}
      <DropdownMenuItem asChild className="px-2 py-0.5 text-xs text-gray-600">
        <Link href={PRIVACY_POLICY_URL} prefetch={false} target="_blank" rel="noopener noreferrer">
          {tLegal('privacy-policy')}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="px-2 py-0.5 text-xs text-gray-600">
        <Link href={IMPRESSUM_URL} prefetch={false} target="_blank" rel="noopener noreferrer">
          {tLegal('imprint')}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="px-2 py-0.5 text-xs text-gray-600">
        <Link href={TERMS_OF_USE_URL} prefetch={false} target="_blank" rel="noopener noreferrer">
          {tLegal('terms-of-use')}
        </Link>
      </DropdownMenuItem>
    </>
  );
}
