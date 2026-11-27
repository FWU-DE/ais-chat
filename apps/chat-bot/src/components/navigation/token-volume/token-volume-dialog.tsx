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

type TokenVolume = {
  usedBudgetInCent: number;
  maxBudgetInCent: number;
  daysUntilRenewal: number;
};

type TokenVolumeState =
  { status: 'loading' } | { status: 'error' } | { status: 'loaded'; value: TokenVolume };

export function TokenVolumeDialog({
  open,
  onOpenChange,
  restoreFocusRef,
  initialDaysUntilRenewal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
  initialDaysUntilRenewal: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <TokenVolumeDialogContent
          restoreFocusRef={restoreFocusRef}
          initialDaysUntilRenewal={initialDaysUntilRenewal}
        />
      )}
    </Dialog>
  );
}

function TokenVolumeDialogContent({
  restoreFocusRef,
  initialDaysUntilRenewal,
}: {
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
  initialDaysUntilRenewal: number;
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
          {t('renewal-info', {
            days:
              state.status === 'loaded' ? state.value.daysUntilRenewal : initialDaysUntilRenewal,
          })}
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
  const displayedPercentage = Number.isFinite(remainingPercentage)
    ? Math.min(Math.max(Math.floor(remainingPercentage), 0), 100)
    : 0;

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
        <TokenPointsProgressBar percentage={displayedPercentage} ariaLabel={t('remaining')} />
      )}
    </div>
  );
}
