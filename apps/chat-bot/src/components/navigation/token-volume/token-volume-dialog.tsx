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
} from '@ui/components/dialog';
import { Skeleton } from '@ui/components/skeleton';
import { useTranslations } from 'next-intl';
import React from 'react';

import { getTokenVolumeAction } from '@/app/(authed)/(chat-bot)/actions';
import TokenPointsProgressBar from '@/components/token-points-progress-bar';

const RENEWAL_TIME_ZONE = 'Europe/Berlin';

type TokenVolume = {
  usedBudgetInCent: number;
  maxBudgetInCent: number;
};

type TokenVolumeState =
  { status: 'loading' } | { status: 'error' } | { status: 'loaded'; value: TokenVolume };

export function TokenVolumeDialog({
  open,
  onOpenChange,
  restoreFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <TokenVolumeDialogContent restoreFocusRef={restoreFocusRef} />}
    </Dialog>
  );
}

function TokenVolumeDialogContent({
  restoreFocusRef,
}: {
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations('token-volume');
  const tCommon = useTranslations('common');
  const [state, setState] = React.useState<TokenVolumeState>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    getTokenVolumeAction()
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.success) {
          setState({ status: 'loaded', value: result.value });
          return;
        }
        setState({ status: 'error' });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <DialogContent
      className="min-h-[272px] max-w-[min(398px,calc(100%-2rem))] gap-0 overflow-y-auto rounded-[20px] px-6 pt-[30px] pb-8 sm:px-10 sm:pt-[30px] sm:pb-8"
      // Opened programmatically, so Radix has no trigger to restore focus to.
      onCloseAutoFocus={(event) => {
        if (!restoreFocusRef?.current) {
          return;
        }
        event.preventDefault();
        restoreFocusRef.current.focus();
      }}
    >
      <DialogHeader className="mb-[26px]">
        <DialogTitle className="leading-[23px]">{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('description')}</DialogDescription>
      </DialogHeader>
      <div className="w-full max-w-[304px]">
        <div aria-busy={state.status === 'loading'}>
          {state.status === 'loading' && (
            <div data-testid="token-volume-skeleton">
              <span className="sr-only" role="status">
                {t('loading')}
              </span>
              <TokenVolumeContent value={null} />
            </div>
          )}
          {state.status === 'error' && (
            <div className="flex flex-col gap-3" role="alert">
              <p className="text-base">{t('load-error')}</p>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setState({ status: 'loading' });
                    setAttempt((count) => count + 1);
                  }}
                >
                  {t('retry')}
                </Button>
              </div>
            </div>
          )}
          {state.status === 'loaded' && <TokenVolumeContent value={state.value} />}
        </div>
        <p className="mt-[7px] text-center text-xs leading-[23px] text-foreground/70">
          {t('renewal-info', { days: getDaysUntilMonthRenewal(new Date()) })}
        </p>
      </div>
      <DialogFooter className="mt-auto pt-[34px]">
        <DialogClose asChild>
          <Button type="button" className="h-11 min-w-[101px] px-4">
            {tCommon('close')}
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}

function TokenVolumeContent({ value }: { value: TokenVolume | null }) {
  const t = useTranslations('token-volume');
  const remainingPercentage =
    value !== null && value.maxBudgetInCent > 0
      ? 100 - (value.usedBudgetInCent / value.maxBudgetInCent) * 100
      : 0;
  const displayedPercentage = Math.max(Math.floor(remainingPercentage), 0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        {value === null ? (
          <Skeleton className="h-[18px] w-10 rounded-[2px]" aria-hidden="true" />
        ) : (
          <span className="text-lg leading-[18px] font-semibold">{displayedPercentage}%</span>
        )}
        <span className="text-xs leading-[18px] text-foreground/70">{t('remaining')}</span>
      </div>
      {value === null ? (
        <Skeleton className="h-[9px] w-full rounded-[2px]" aria-hidden="true" />
      ) : (
        <TokenPointsProgressBar percentage={remainingPercentage} ariaLabel={t('remaining')} />
      )}
    </div>
  );
}

/**
 * Budget periods are calendar months in Europe/Berlin, see getStartOfCurrentMonth.
 * Counts the calendar days from today until the 1st of next month.
 */
export function getDaysUntilMonthRenewal(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RENEWAL_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return daysInMonth - day + 1;
}
