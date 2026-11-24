'use client';

import { useTranslations } from 'next-intl';

import { Badge } from './badge';

export function NewBadge() {
  const t = useTranslations('common');

  return <Badge text={t('new-badge')} className="uppercase" />;
}
