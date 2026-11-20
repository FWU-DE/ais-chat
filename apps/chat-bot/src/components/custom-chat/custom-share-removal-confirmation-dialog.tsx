'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@ui/components/alert-dialog';
import { useTranslations } from 'next-intl';

type CustomShareRemovalConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function CustomShareRemovalConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
}: CustomShareRemovalConfirmationDialogProps) {
  const t = useTranslations('sharing');

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('community-removal-confirmation.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('community-removal-confirmation.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            {t('community-removal-confirmation.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {t('community-removal-confirmation.accept')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
