'use client';

import { Chip } from '@ui/components/chip';
import { useTranslations } from 'next-intl';

type CostTier = 'low' | 'medium' | 'high';

const MIN_DISPLAY_FACTOR = 0.1;
const MEDIUM_TIER_START = 1;
const HIGH_TIER_START = 10;

const TIER_VARIANT: Record<CostTier, 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
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

export function ModelCostChip({ factor }: { factor: number }) {
  const t = useTranslations('models');
  const displayFactor = roundFactor(factor);

  return (
    <Chip
      size="sm"
      className="text-sm"
      variant={TIER_VARIANT[getCostTier(displayFactor)]}
      label={t('cost-factor', { factor: displayFactor })}
    />
  );
}
