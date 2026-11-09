'use client';

import { HeartIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { cn } from '@/utils/tailwind';

type FavoriteButtonProps = {
  isFavorite: boolean;
  onToggle: (isFavorite: boolean) => Promise<void>;
  className?: string;
};

export function FavoriteButton({ isFavorite, onToggle, className }: FavoriteButtonProps) {
  const t = useTranslations('common');
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      await onToggle(!isFavorite);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-round"
      className={cn(className)}
      aria-label={t('favorite')}
      aria-pressed={isFavorite}
      disabled={isPending}
      onClick={handleClick}
      data-testid="favorite-button"
    >
      <HeartIcon
        aria-hidden="true"
        className="size-6 text-primary"
        weight={isFavorite ? 'fill' : 'regular'}
      />
    </Button>
  );
}
