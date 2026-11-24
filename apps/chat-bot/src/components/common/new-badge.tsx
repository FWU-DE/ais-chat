'use client';

import { Chip } from '@ui/components/chip';
import { useTranslations } from 'next-intl';

export function NewBadge() {
  const t = useTranslations('common');

  return (
    <Chip
      size="xs"
      variant="secondary"
      label={t('new-badge')}
      className="bg-secondary font-semibold uppercase"
    />
  );
}
