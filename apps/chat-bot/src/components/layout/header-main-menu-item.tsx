import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@ui/components/dropdown-menu';
import { CaretDownIcon } from '@phosphor-icons/react';
import { GreenLeafIcon } from '../icons/green-leaf-icon';
import { Badge } from '../common/badge';
import React from 'react';

type HeaderMainMenuItemProps = {
  caption: string;
  triggerLabel: string;
  triggerAriaLabel: string;
  children: ReactNode;
  isDropdownEnabled?: boolean;
  selectedMenuItemTestId?: string;
  mainMenuItemTestId?: string;
  isNew?: boolean;
  isGreen?: boolean;
};

export function HeaderMainMenuItem({
  caption,
  triggerLabel,
  triggerAriaLabel,
  children,
  isDropdownEnabled = true,
  isNew,
  isGreen,
  selectedMenuItemTestId,
  mainMenuItemTestId,
}: HeaderMainMenuItemProps) {
  const mainMenuItem = (
    <span className="flex flex-row gap-1.5 items-center text-primary text-base font-medium min-w-0">
      <span className="min-w-0 wrap-break-word line-clamp-2" data-testid={selectedMenuItemTestId}>
        {triggerLabel}
      </span>
      {isGreen && <GreenLeafIcon />}
      {isNew && <Badge text="NEU" />}
      {isDropdownEnabled && <CaretDownIcon className="shrink-0" />}
    </span>
  );
  const triggerButton = (
    <button
      type="button"
      disabled={!isDropdownEnabled}
      className="outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-ring/50 min-w-0 max-w-full"
      aria-label={triggerAriaLabel}
      data-testid={mainMenuItemTestId}
    >
      {mainMenuItem}
    </button>
  );

  return (
    <div className="flex flex-col gap-2 p-2 min-w-0 max-w-full">
      <span className="text-xs text-gray-600 hidden sm:block">{caption}</span>
      {isDropdownEnabled ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
          <DropdownMenuContent
            className="px-0 py-0"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
          >
            {children}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        mainMenuItem
      )}
    </div>
  );
}
