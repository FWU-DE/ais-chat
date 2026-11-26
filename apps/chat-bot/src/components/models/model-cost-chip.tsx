'use client';

import { roundCostFactor } from '@shared/llm-models/cost-factor';
import { Chip } from '@ui/components/chip';
import { useTranslations } from 'next-intl';

type CostTier = 'low' | 'medium' | 'high';

const MEDIUM_TIER_START = 1;
const HIGH_TIER_START = 10;

const TIER_VARIANT: Record<CostTier, 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
};

function getCostTier(factor: number): CostTier {
  if (factor <= MEDIUM_TIER_START) return 'low';
  if (factor < HIGH_TIER_START) return 'medium';
  return 'high';
}

export function ModelCostChip({ factor }: { factor: number }) {
  const t = useTranslations('models');
  const displayFactor = roundCostFactor(factor);

  return (
    <Chip
      size="sm"
      className="text-sm"
      variant={TIER_VARIANT[getCostTier(displayFactor)]}
      label={t('cost-factor', { factor: displayFactor })}
    />
  );
}
