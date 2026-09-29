'use client';

import React from 'react';
import { Button } from '@ais-chat/ui/components/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@ais-chat/ui/components/alert-dialog';

type ConfirmationDialogProps = {
  trigger: React.ReactElement;
  title: React.ReactNode;
  description: React.ReactNode;
  content?: React.ReactNode;
  confirmLabel: React.ReactNode;
  confirmVariant?: React.ComponentProps<typeof Button>['variant'];
  cancelLabel?: React.ReactNode;
  confirmTestId?: string;
  cancelTestId?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
};

export function ConfirmationDialog({
  trigger,
  title,
  description,
  content,
  confirmLabel,
  confirmVariant = 'default',
  cancelLabel,
  confirmTestId,
  cancelTestId,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setOpen(true);
    }
  }, []);

  const handleCancel = React.useCallback(() => {
    onCancel?.();
    setOpen(false);
  }, [onCancel]);

  const handleConfirm = React.useCallback(async () => {
    setIsConfirming(true);

    try {
      await onConfirm();
    } finally {
      // close dialog in any case, even if onConfirm throws an error
      setIsConfirming(false);
      setOpen(false);
    }
  }, [onConfirm]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={handleOpenChange}
      aria-describedby="confirmation-dialog-message"
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {content && <div className="overflow-y-auto">{content}</div>}
        <AlertDialogFooter>
          <AlertDialogCancel
            data-testid={cancelTestId}
            disabled={isConfirming}
            onClick={handleCancel}
          >
            {cancelLabel ?? 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            data-testid={confirmTestId}
            disabled={isConfirming}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
