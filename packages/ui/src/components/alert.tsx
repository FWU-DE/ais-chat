import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

const alertVariants = cva(
  'flex min-h-16 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-6 py-4 text-base text-foreground',
  {
    variants: {
      variant: {
        info: 'border-transparent bg-secondary/30',
        warning: 'border-warning/50 bg-warning/10',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  },
);

const ALERT_ROLE = {
  info: 'status',
  warning: 'alert',
} as const;

function Alert({
  className,
  variant = 'info',
  role,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role={role ?? ALERT_ROLE[variant ?? 'info']}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertIcon({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="alert-icon"
      aria-hidden="true"
      className={cn('flex shrink-0 items-center', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="alert-description" className={cn('min-w-40 flex-1', className)} {...props} />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-action" className={cn('shrink-0', className)} {...props} />;
}

export { Alert, AlertAction, AlertDescription, AlertIcon };
