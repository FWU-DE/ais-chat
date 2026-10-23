'use client';

import { type UserAndContext } from '@/auth/types';
import type { ApplicationHeaderMenuItem } from '@/components/layout/application-header';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { DotsThreeIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/components/dropdown-menu';
import React from 'react';
import { ProfileMenuContent } from './profile-menu-content';

export type ThreeDotsProfileMenuItem = ApplicationHeaderMenuItem;

export function ThreeDotsProfileMenu({
  customItems,
  userAndContext,
}: {
  customItems?: ThreeDotsProfileMenuItem[];
  userAndContext?: UserAndContext;
}) {
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-round"
          type="button"
          aria-label="More actions"
          title="More actions"
          className="text-primary"
        >
          <DotsThreeIcon weight="bold" className="size-6" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[256px] z-300 flex flex-col gap-2 px-2 py-2 rounded-enterprise-md shadow-dropdown"
      >
        {customItems?.map((item) => (
          <DropdownMenuItem
            key={item.id}
            disabled={item.disabled}
            onSelect={() => item.onSelect()}
            className="text-primary"
          >
            {item.icon !== undefined && item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
        {(customItems?.length ?? 0) > 0 && (
          <DropdownMenuSeparator className="border-gray-200 mx-2" />
        )}
        <ProfileMenuContent
          userAndContext={userAndContext}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </DropdownMenuContent>
      {/* Public shared chats render this menu without a UserSettingsProvider. */}
      {userAndContext !== undefined && (
        <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      )}
    </DropdownMenu>
  );
}
