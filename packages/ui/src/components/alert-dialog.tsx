'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '../lib/utils';
import { Button } from './button';
import { usePortalContainer } from './portal-container';

const alertDialogContentVariants = cva(
  'bg-background fixed top-[50%] left-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-2xl shadow-lg group/alert-dialog-content duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
  {
    variants: {
      size: {
        default: 'sm:max-w-lg',
        sm: 'sm:max-w-xs',
        lg: 'max-w-[min(48rem,calc(100%-2rem))]',
      },
      variant: {
        default: 'grid gap-4 p-4 sm:gap-8 sm:p-8 sm:pt-6',
        scrollable: 'flex flex-col overflow-hidden max-h-[calc(100dvh-1rem)] p-4 sm:p-8 sm:py-6',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
  },
);

const alertDialogScrollAreaClassName =
  'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 sm:gap-8 sm:pr-2';

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  const container = usePortalContainer();
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" container={container} {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = 'default',
  variant = 'default',
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> &
  VariantProps<typeof alertDialogContentVariants>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        data-variant={variant}
        className={cn(alertDialogContentVariants({ size, variant }), className)}
        {...props}
      >
        {variant === 'scrollable' ? (
          <div data-slot="alert-dialog-scroll-area" className={alertDialogScrollAreaClassName}>
            {children}
          </div>
        ) : (
          children
        )}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        'grid gap-0 has-[>:nth-child(2)]:gap-4 place-items-center text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=lg]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=lg]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr] sm:group-data-[size=lg]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        'text-2xl font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2 sm:group-data-[size=lg]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-foreground overflow-hidden', className)}
      {...props}
    />
  );
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 sm:group-data-[size=lg]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action
        data-slot="alert-dialog-action"
        className={cn(className)}
        {...props}
      />
    </Button>
  );
}

function AlertDialogCancel({
  className,
  variant = 'outline',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  );
}

type ConfirmAlertDialogVariant = React.ComponentProps<typeof Button>['variant'];

export type ConfirmAlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  confirmVariant?: ConfirmAlertDialogVariant;
  onConfirm: () => void | Promise<void>;
};

/**
 * Reusable confirmation dialog. Render once at a stable parent (e.g. a page
 * or section component) and toggle via `open`. Designed to be triggered from
 * places where embedding an AlertDialog directly is problematic — most
 * notably inside Radix DropdownMenu items, where nesting another focus-trap
 * primitive causes the menu to stay open after confirming.
 *
 * Pair with `useConfirmAlertDialog` for ergonomic open/handler wiring.
 */
function ConfirmAlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'destructive',
  onConfirm,
}: ConfirmAlertDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        {description !== undefined && (
          <AlertDialogDescription>{description}</AlertDialogDescription>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            onClick={() => onConfirm()}
            data-testid="confirm-alert-dialog-confirm-button"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type UseConfirmAlertDialogResult = {
  dialogProps: Pick<ConfirmAlertDialogProps, 'open' | 'onOpenChange' | 'onConfirm'>;
  confirm: (onConfirm: () => void | Promise<void>) => void;
};

function useConfirmAlertDialog(): UseConfirmAlertDialogResult {
  const [open, setOpen] = React.useState(false);
  const onConfirmRef = React.useRef<() => void | Promise<void>>(() => {});

  const confirm = React.useCallback((onConfirm: () => void | Promise<void>) => {
    onConfirmRef.current = onConfirm;
    setOpen(true);
  }, []);

  const handleConfirm = React.useCallback(async () => {
    try {
      await onConfirmRef.current();
      setOpen(false);
    } catch {
      // Keep the dialog open when confirmation fails.
    }
  }, []);

  return {
    dialogProps: { open, onOpenChange: setOpen, onConfirm: handleConfirm },
    confirm,
  };
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  ConfirmAlertDialog,
  useConfirmAlertDialog,
};
