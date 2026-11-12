'use client';

import {
  calculateGracePeriodTimeLeftInSeconds,
  ShareSessionState,
} from '@shared/sharing/calculate-share-session-state';
import { formatDurationAsClock } from '@shared/utils/date';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface CustomChatGraceWindowNoteProps {
  expiredAt: Date | null;
  shareSessionState: ShareSessionState;
}

export function CustomChatGraceWindowNote({
  expiredAt,
  shareSessionState,
}: CustomChatGraceWindowNoteProps) {
  const t = useTranslations('custom-chat.share-with-learners');

  const [gracePeriodTimeLeftInSeconds, setGracePeriodTimeLeftInSeconds] = useState(() =>
    calculateGracePeriodTimeLeftInSeconds(expiredAt),
  );

  // Sync countdown when expiredAt changes (e.g. after polling or extending)
  useEffect(() => {
    const reset = window.setTimeout(() => {
      setGracePeriodTimeLeftInSeconds(calculateGracePeriodTimeLeftInSeconds(expiredAt));
    }, 0);
    return () => window.clearTimeout(reset);
  }, [expiredAt]);

  // Tick countdown every second
  useEffect(() => {
    if (shareSessionState !== ShareSessionState.EXPIRED_RECENTLY) return;
    const timer = setInterval(() => {
      setGracePeriodTimeLeftInSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [shareSessionState]);

  if (shareSessionState !== ShareSessionState.EXPIRED_RECENTLY) return null;

  return (
    <p className="text-sm text-gray-600 text-center">
      {t('session-will-be-closed', {
        time: formatDurationAsClock(gracePeriodTimeLeftInSeconds),
      })}
    </p>
  );
}
