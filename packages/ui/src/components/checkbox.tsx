'use client';

import { CheckIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '../lib/utils';

function Checkbox({
  className,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (event) => {
    onKeyDown?.(event);

    if (event.defaultPrevented || event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    event.currentTarget.click();
  };

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      onKeyDown={handleKeyDown}
      className={cn(
        'border-(--dark-gray) border dark:bg-input/30 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white dark:data-[state=checked]:border-primary dark:data-[state=checked]:bg-primary aria-invalid:data-[state=checked]:border-primary aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex size-4 items-center justify-center rounded-[2px] transition-colors group-has-disabled/field:opacity-50 focus-visible:ring-3 aria-invalid:ring-3 peer relative shrink-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="[&>svg]:size-3.5 grid place-content-center text-current transition-none"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
