'use client';

import { HeartStraightIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui/components/tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { cn } from '@/utils/tailwind';

type FavoriteButtonProps = {
  isFavorite: boolean;
  onToggle: (isFavorite: boolean) => Promise<void>;
  disabled?: boolean;
  className?: string;
};

export function FavoriteButton({
  isFavorite,
  onToggle,
  disabled = false,
  className,
}: FavoriteButtonProps) {
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
    <Tooltip>
      <TooltipTrigger asChild disableKeyboardToggle>
        <Button
          type="button"
          variant="ghost"
          size="icon-round"
          className={cn(className)}
          // Constant name: with aria-pressed the state is announced separately.
          aria-label={t('favorite-add')}
          aria-pressed={isFavorite}
          disabled={isPending || disabled}
          onClick={handleClick}
          data-testid="favorite-button"
        >
          <HeartStraightIcon
            aria-hidden="true"
            className="size-6 text-primary"
            weight={isFavorite ? 'fill' : 'regular'}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t(isFavorite ? 'favorite-remove' : 'favorite-add')}</TooltipContent>
    </Tooltip>
  );
}
