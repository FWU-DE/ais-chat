'use client';

import { type UserAndContext } from '@/auth/types';
import { UserIcon } from '@/components/icons/user';
import { Button } from '@ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@ui/components/dropdown-menu';
import { useTranslations } from 'next-intl';
import { ProfileMenuContent } from './profile-menu-content';

export default function ProfileMenu({ userAndContext }: { userAndContext?: UserAndContext }) {
  const t = useTranslations('common');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-round"
          aria-label={t('profile-dropdown')}
          className="text-primary"
          title="Profil"
        >
          <UserIcon className="size-8" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="z-300 flex flex-col gap-2 py-2 w-[256px] rounded-enterprise-md mb-4 bg-white shadow-dropdown"
      >
        <ProfileMenuContent userAndContext={userAndContext} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
