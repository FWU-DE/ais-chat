import { DropdownMenuItem } from '@ui/components/dropdown-menu';
import type { ComponentProps } from 'react';

import { cn } from '@/utils/tailwind';

export type HeaderMenuItemProps = ComponentProps<typeof DropdownMenuItem>;

export function HeaderMenuItem({ className, children, ...props }: HeaderMenuItemProps) {
  return (
    <DropdownMenuItem
      {...props}
      className={cn(
        'flex flex-row gap-3 items-center px-4 py-4 text-primary text-base focus:bg-primary/15 rounded-none',
        className,
      )}
    >
      {children}
    </DropdownMenuItem>
  );
}
