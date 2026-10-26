'use client';

import { type UserAndContext } from '@/auth/types';
import { UserIcon } from '@/components/icons/user';
import { Button } from '@ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@ui/components/dropdown-menu';
import type { RefObject } from 'react';
import React from 'react';
import { ProfileMenuContent } from './profile-menu-content';

export default function ProfileMenu({
  userAndContext,
  onOpenSettings,
  triggerRef,
}: {
  userAndContext?: UserAndContext;
  onOpenSettings?: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon-round"
          aria-label="profileDropdown"
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
        <ProfileMenuContent userAndContext={userAndContext} onOpenSettings={onOpenSettings} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
