'use client';

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

import {
  MaxTokenPointsPercentageLimit,
  tokenPointsPercentageValues,
} from './custom-chat-share-with-learners-limit-params';
import { TokenPointsLimitSelect } from './custom-chat-token-points-limit-select';

type CustomChatAdjustTokenLimitDialogProps = {
  trigger: React.ReactElement<{ disabled?: boolean }>;
  sharedChatActive: boolean;
  currentTokenPointsPercentageLimit: number;
  maxAvailablePercentage: number;
  onAdjustTokenLimit: (data: { tokenPointsPercentageLimit: number }) => Promise<{
    success: boolean;
    tokenPointsLimit?: number;
  }>;
  onAdjustTokenLimitSuccess: (newTokenPointsLimit: number) => void;
};

export function CustomChatAdjustTokenLimitDialog({
  trigger,
  sharedChatActive,
  currentTokenPointsPercentageLimit,
  maxAvailablePercentage,
  onAdjustTokenLimit,
  onAdjustTokenLimitSuccess,
}: CustomChatAdjustTokenLimitDialogProps) {
  const toast = useToast();

  const t = useTranslations('custom-chat.share-with-learners');
  const tToast = useTranslations('custom-chat.toasts');
  const tCommon = useTranslations('common');

  const higherFixedValues = tokenPointsPercentageValues.filter(
    (value) => value > currentTokenPointsPercentageLimit && value < maxAvailablePercentage,
  );
  const hasHigherMaximumOption =
    currentTokenPointsPercentageLimit !== MaxTokenPointsPercentageLimit &&
    Math.floor(maxAvailablePercentage) > currentTokenPointsPercentageLimit;
  const hasHigherOption = higherFixedValues.length > 0 || hasHigherMaximumOption;
  const nextHigherOption = higherFixedValues[0] ?? MaxTokenPointsPercentageLimit;

  const [open, setOpen] = React.useState(false);
  const [tokenPointsPercentageLimit, setTokenPointsPercentageLimit] =
    React.useState(nextHigherOption);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleAdjustTokenLimit() {
    setIsSubmitting(true);
    try {
      const result = await onAdjustTokenLimit({ tokenPointsPercentageLimit });
      if (result.success && result.tokenPointsLimit !== undefined) {
        toast.success(tToast('adjust-token-limit-toast-success'));
        setOpen(false);
        onAdjustTokenLimitSuccess(result.tokenPointsLimit);
      }
    } catch {
      toast.error(tToast('adjust-token-limit-toast-error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && hasHigherOption) {
      setTokenPointsPercentageLimit(nextHigherOption);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        asChild
        disabled={Boolean(trigger.props.disabled) || !sharedChatActive || !hasHigherOption}
      >
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="space-y-2">
          <DialogTitle>{t('adjust-token-limit-modal-title')}</DialogTitle>
          <DialogDescription>{t('adjust-token-limit-modal-description')}</DialogDescription>
        </DialogHeader>
        <div>
          <TokenPointsLimitSelect
            label={t('token-points')}
            ariaLabel={t('adjust-token-limit-modal-aria')}
            defaultValue={nextHigherOption}
            value={tokenPointsPercentageLimit}
            onValueChange={setTokenPointsPercentageLimit}
            disabled={isSubmitting}
            pointsPercentageValues={tokenPointsPercentageValues}
            maxAvailablePercentage={maxAvailablePercentage}
            lowerBoundary={currentTokenPointsPercentageLimit + 1}
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
              void handleAdjustTokenLimit();
            }}
          >
            {t('button-save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
