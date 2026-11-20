'use client';

import type { EntityRef } from '@shared/entities/entity-types';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { setFavoriteAction } from '@/app/(authed)/(chat-bot)/actions/favorite-actions';
import { useToast } from '@/components/common/toast';

/** Returns a function that persists the favorite state and shows an error toast on failure. */
export function useSetFavorite() {
  const toast = useToast();
  const t = useTranslations('common');

  return useCallback(
    async (entityRef: EntityRef, isFavorite: boolean): Promise<boolean> => {
      try {
        const result = await setFavoriteAction({ ...entityRef, isFavorite });
        if (result.success) return true;
      } catch {
        // A rejected request is treated like a failed save.
      }
      toast.error(t('favorite-error'));
      return false;
    },
    [toast, t],
  );
}
