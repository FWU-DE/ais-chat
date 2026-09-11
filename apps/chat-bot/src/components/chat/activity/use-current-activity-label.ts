'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AiActivityStep } from '@/types/ai-activity';
import { getAiActivityStepTitle } from './ai-activity';

/** Steps can follow each other quickly; keep each one readable before showing the next. */
const MIN_STEP_DISPLAY_MS = 3000;

/**
 * Title of the step the agent is currently working on, updated at most every
 * {@link MIN_STEP_DISPLAY_MS} milliseconds.
 */
export function useCurrentActivityLabel(steps: AiActivityStep[]): string | undefined {
  const t = useTranslations('ai-activity');
  const latestStep = steps.at(-1);
  const latestTitle = latestStep === undefined ? undefined : getAiActivityStepTitle(latestStep, t);
  const [displayedTitle, setDisplayedTitle] = useState<string | undefined>(latestTitle);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (latestTitle === displayedTitle) {
      return;
    }

    const remainingMs =
      latestTitle === undefined
        ? 0
        : Math.max(0, MIN_STEP_DISPLAY_MS - (Date.now() - lastUpdateRef.current));

    const timer = setTimeout(() => {
      lastUpdateRef.current = Date.now();
      setDisplayedTitle(latestTitle);
    }, remainingMs);

    return () => clearTimeout(timer);
  }, [latestTitle, displayedTitle]);

  return displayedTitle;
}
