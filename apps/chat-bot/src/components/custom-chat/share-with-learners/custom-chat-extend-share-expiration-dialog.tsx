'use client';

import { MAX_EXTENDABLE_USAGE_TIME_IN_SECONDS } from '@shared/sharing/const';
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

import { useToast } from '@/components/common/toast';

import { extendTimeValuesInMinutes } from './custom-chat-share-with-learners-limit-params';
import { TimeLimitSelect } from './custom-chat-time-limit-select';

type CustomChatExtendShareExpirationDialogProps = {
  trigger: React.ReactElement<{ disabled?: boolean }>;
  preselectedUsageTimeLimit: number;
  currentUsageTimeRemaining: number;
  onAddTime: (data: { additionalTimeInMinutes: number }) => Promise<{
    success: boolean;
    expiredAt?: Date;
  }>;
  onAddTimeSuccess: (newExpiredAt: Date) => void;
};

export function CustomChatExtendShareExpirationDialog({
  trigger,
  preselectedUsageTimeLimit,
  currentUsageTimeRemaining,
  onAddTime,
  onAddTimeSuccess,
}: CustomChatExtendShareExpirationDialogProps) {
  const toast = useToast();

  const t = useTranslations('custom-chat.share-with-learners');
  const tToast = useTranslations('custom-chat.toasts');
  const tCommon = useTranslations('common');

  const [open, setOpen] = React.useState(false);
  const [additionalTimeInMinutes, setAdditionalTimeInMinutes] = React.useState(45);
  const [selectVersion, setSelectVersion] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isExtendableTimeLimitExceeded =
    currentUsageTimeRemaining >= MAX_EXTENDABLE_USAGE_TIME_IN_SECONDS;

  async function handleAddTime() {
    setIsSubmitting(true);
    try {
      const result = await onAddTime({ additionalTimeInMinutes });
      if (result.success && result.expiredAt) {
        toast.success(tToast('add-time-toast-success'));
        setOpen(false);
        onAddTimeSuccess(result.expiredAt);
      }
    } catch {
      toast.error(tToast('add-time-toast-error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAdditionalTimeInMinutes(preselectedUsageTimeLimit);
      setSelectVersion((current) => current + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        asChild
        disabled={Boolean(trigger.props.disabled) || isExtendableTimeLimitExceeded}
      >
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="space-y-2">
          <DialogTitle>{t('additional-time-modal-title')}</DialogTitle>
          <DialogDescription>{t('additional-time-modal-description')}</DialogDescription>
        </DialogHeader>
        <div>
          <TimeLimitSelect
            key={selectVersion}
            ariaLabel={t('additional-time-modal-aria')}
            defaultValue={preselectedUsageTimeLimit}
            onChange={setAdditionalTimeInMinutes}
            disabled={isSubmitting}
            usageTimeValuesInMinutes={extendTimeValuesInMinutes}
            isAdditionalTime
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              {tCommon('cancel')}
            </Button>
          </DialogClose>
          <Button
            variant="default"
            disabled={isSubmitting}
            onClick={() => {
              void handleAddTime();
            }}
          >
            {t('button-additional-time')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
