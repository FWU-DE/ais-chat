'use client';

import StopWatchIcon from '@/components/icons/stopwatch';
import { cn } from '@/utils/tailwind';
import { formatDuration } from '@shared/utils/date';
import { useTranslations } from 'next-intl';
import React from 'react';

type CountDownTimerProps = {
  leftTimeInSeconds: number;
  totalTimeInSeconds: number;
  className?: string;
  stopWatchClassName?: string;
  onExpire?: () => void;
};
export default function CountDownTimer({
  leftTimeInSeconds,
  totalTimeInSeconds,
  className,
  stopWatchClassName,
  onExpire,
}: CountDownTimerProps) {
  const t = useTranslations('sharing');
  const [timeRemaining, setTimeRemaining] = React.useState(Math.max(leftTimeInSeconds, 0));

  // keep the latest onExpire callback without re-triggering the effects below
  const onExpireRef = React.useRef(onExpire);
  React.useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // ensures onExpire fires at most once per countdown cycle (reset below when leftTimeInSeconds changes)
  const hasNotifiedExpiryRef = React.useRef(false);
  const notifyExpiry = React.useCallback(() => {
    if (!hasNotifiedExpiryRef.current) {
      hasNotifiedExpiryRef.current = true;
      onExpireRef.current?.();
    }
  }, []);

  // synchronize internal state with changes to leftTimeInSeconds (i.e. extend usage time)
  React.useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      const nextTimeRemaining = Math.max(leftTimeInSeconds, 0);
      setTimeRemaining(nextTimeRemaining);
      if (nextTimeRemaining > 0) {
        // countdown was restarted/extended - allow onExpire to fire again next time it runs out
        hasNotifiedExpiryRef.current = false;
      } else {
        notifyExpiry();
      }
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [leftTimeInSeconds, notifyExpiry]);

  // countdown timer
  React.useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prevTime) => {
        if (prevTime <= 1) {
          notifyExpiry();
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [notifyExpiry]);

  const textClassName = getColorByLeftAndTotalTime({ leftTimeInSeconds, totalTimeInSeconds });

  return (
    <div
      data-testid="countdown-timer"
      role="timer"
      aria-label={`${t('countdown-timer-label')}: ${formatDuration(timeRemaining)}`}
      className={cn(
        'flex gap-2 items-center min-w-36 px-4 py-2 rounded-xl justify-center',
        className,
        textClassName,
      )}
    >
      <StopWatchIcon className={stopWatchClassName} aria-hidden="true" />
      <span aria-hidden="true">{formatDuration(timeRemaining)}</span>
    </div>
  );
}

function getColorByLeftAndTotalTime({
  leftTimeInSeconds,
  totalTimeInSeconds,
}: CountDownTimerProps) {
  const percentage = leftTimeInSeconds / totalTimeInSeconds;

  if (percentage > 0.2) {
    return 'text-dark-green bg-light-green';
  }
  return 'text-dark-red bg-light-red';
}
