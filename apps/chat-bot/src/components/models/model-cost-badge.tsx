'use client';

import { cn } from '@ui/lib/utils';
import { useTranslations } from 'next-intl';

type CostTier = 'low' | 'medium' | 'high';

const MIN_DISPLAY_FACTOR = 0.1;
const MEDIUM_TIER_START = 1;
const HIGH_TIER_START = 10;

const TIER_CLASSES: Record<CostTier, string> = {
  low: 'bg-success/20',
  medium: 'bg-warning/40',
  high: 'bg-destructive/20',
};

/** Rounds to one decimal; a paid model never shows less than 0.1x. */
function roundFactor(factor: number): number {
  return factor > 0 ? Math.max(MIN_DISPLAY_FACTOR, Math.round(factor * 10) / 10) : 0;
}

function getCostTier(factor: number): CostTier {
  if (factor <= MEDIUM_TIER_START) return 'low';
  if (factor < HIGH_TIER_START) return 'medium';
  return 'high';
}

export function ModelCostBadge({ factor }: { factor: number }) {
  const t = useTranslations('models');
  const displayFactor = roundFactor(factor);

  return (
    <span
      className={cn(
        'inline-block rounded-full px-3 py-0.5 text-sm font-medium',
        TIER_CLASSES[getCostTier(displayFactor)],
      )}
    >
      {t('cost-factor', { factor: displayFactor })}
    </span>
  );
}
