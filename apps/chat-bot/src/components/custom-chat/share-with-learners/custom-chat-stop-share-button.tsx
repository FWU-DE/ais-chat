'use client';

import { useToast } from '@/components/common/toast';
import { TrashSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ui/components/dialog';
import { useTranslations } from 'next-intl';
import React from 'react';

type CustomChatStopShareButtonProps = {
  onUnshare: () => Promise<{ success: boolean }>;
  onStopShareSuccess: () => void;
  className?: string;
};

export function CustomChatStopShareButton({
  onUnshare,
  onStopShareSuccess,
  className,
}: CustomChatStopShareButtonProps) {
  const toast = useToast();
  const t = useTranslations('custom-chat.share-with-learners');
  const tToast = useTranslations('custom-chat.toasts');
  const tCommon = useTranslations('common');

  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleConfirmStopSharing() {
    setIsSubmitting(true);
    try {
      const result = await onUnshare();

      if (result.success) {
        toast.success(tToast('stop-share-toast-success'));
        setOpen(false);
        onStopShareSuccess();
        return;
      }
    } catch {
      // Errors are handled by the generic failure toast below.
    } finally {
      setIsSubmitting(false);
    }

    toast.error(tToast('stop-share-toast-error'));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="destructive"
          data-testid="stop-share-button"
          className={className}
        >
          <TrashSimpleIcon className="size-5" aria-hidden="true" /> {t('button-close-session')}
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="stop-share-dialog">
        <DialogHeader className="space-y-2">
          <DialogTitle data-testid="stop-share-dialog-title">
            {t('stop-share-modal-title')}
          </DialogTitle>
          <DialogDescription
            className="whitespace-pre-line"
            data-testid="stop-share-dialog-description"
          >
            {t('stop-share-modal-description')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              disabled={isSubmitting}
              data-testid="stop-share-cancel-button"
              variant="outline"
            >
              {tCommon('cancel')}
            </Button>
          </DialogClose>
          <Button
            disabled={isSubmitting}
            data-testid="stop-share-confirm-button"
            onClick={() => {
              void handleConfirmStopSharing();
            }}
          >
            {t('button-close-session')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
