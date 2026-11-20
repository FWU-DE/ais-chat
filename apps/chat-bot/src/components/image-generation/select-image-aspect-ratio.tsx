'use client';

import { Separator } from '@ui/components/separator';
import { useTranslations } from 'next-intl';

import { HeaderMainMenuItem } from '../layout/header-main-menu-item';
import { HeaderMenuItem } from '../layout/header-menu-item';
import { useImageAspectRatio } from './image-aspect-ratio-provider';

export default function SelectImageAspectRatio() {
  const { aspectRatio, setAspectRatio } = useImageAspectRatio();
  const t = useTranslations('image-generation.aspect-ratio');

  return (
    <HeaderMainMenuItem
      caption={t('label')}
      triggerLabel={t(aspectRatio)}
      triggerAriaLabel={t('aria-label')}
    >
      <HeaderMenuItem onClick={() => setAspectRatio('quadratic')}>{t('quadratic')}</HeaderMenuItem>
      <Separator className="mx-2 border-b-0" />
      <HeaderMenuItem onClick={() => setAspectRatio('portrait')}>{t('portrait')}</HeaderMenuItem>
      <Separator className="mx-2 border-b-0" />
      <HeaderMenuItem onClick={() => setAspectRatio('landscape')}>{t('landscape')}</HeaderMenuItem>
    </HeaderMainMenuItem>
  );
}
