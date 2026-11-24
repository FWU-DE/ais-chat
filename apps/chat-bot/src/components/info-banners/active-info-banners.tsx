'use client';

import { XIcon } from '@phosphor-icons/react';
import type { InfoBanner } from '@shared/info-banners/info-banner';
import { Button } from '@ui/components/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { trackInfoBannerViewAction } from '@/app/(authed)/(chat-bot)/actions';
import {
  readSessionStorage,
  useSessionStorageState,
  writeSessionStorage,
} from '@/hooks/use-session-storage-state';
import { cn } from '@/utils/tailwind';

const DISMISSED_INFO_BANNERS_STORAGE_KEY = 'dismissed-info-banner-ids';
const TRACKED_INFO_BANNERS_STORAGE_KEY = 'tracked-info-banner-ids';
const pendingTrackedInfoBannerIds = new Set<string>();

function parseInfoBannerIds(raw: string | null): string[] {
  if (raw === null) {
    return [];
  }
  try {
    const parsedValue = JSON.parse(raw);
    return Array.isArray(parsedValue)
      ? parsedValue.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function getStoredInfoBannerIds(storageKey: string): string[] {
  return parseInfoBannerIds(readSessionStorage(storageKey));
}

function persistStoredInfoBannerId(storageKey: string, infoBannerId: string) {
  const storedIds = new Set(getStoredInfoBannerIds(storageKey));
  storedIds.add(infoBannerId);
  writeSessionStorage(storageKey, JSON.stringify(Array.from(storedIds)));
}

// null on the server, so no banner is rendered before the client knows which are dismissed
function useDismissedInfoBannerIds() {
  const [dismissedIds] = useSessionStorageState<string[] | null>(
    DISMISSED_INFO_BANNERS_STORAGE_KEY,
    parseInfoBannerIds,
    null,
  );
  return dismissedIds;
}

export default function ActiveInfoBanners({ infoBanners }: { infoBanners: InfoBanner[] }) {
  const dismissedInfoBannerIds = useDismissedInfoBannerIds();
  const tInfoBanner = useTranslations('info-banner');

  const dismissedIds = new Set(dismissedInfoBannerIds ?? []);
  const currentInfoBanner =
    dismissedInfoBannerIds !== null
      ? infoBanners.find((infoBanner) => !dismissedIds.has(infoBanner.id))
      : undefined;
  const currentInfoBannerId = currentInfoBanner?.id ?? null;

  useEffect(() => {
    if (!currentInfoBannerId) {
      return;
    }

    if (
      pendingTrackedInfoBannerIds.has(currentInfoBannerId) ||
      getStoredInfoBannerIds(TRACKED_INFO_BANNERS_STORAGE_KEY).includes(currentInfoBannerId)
    ) {
      return;
    }

    pendingTrackedInfoBannerIds.add(currentInfoBannerId);

    void trackInfoBannerViewAction(currentInfoBannerId)
      .then(() => {
        persistStoredInfoBannerId(TRACKED_INFO_BANNERS_STORAGE_KEY, currentInfoBannerId);
      })
      .finally(() => {
        pendingTrackedInfoBannerIds.delete(currentInfoBannerId);
      });
  }, [currentInfoBannerId]);

  if (!currentInfoBanner) {
    return null;
  }

  function handleDismiss() {
    if (currentInfoBannerId) {
      persistStoredInfoBannerId(DISMISSED_INFO_BANNERS_STORAGE_KEY, currentInfoBannerId);
    }
  }

  return (
    <div
      className={cn(
        'px-2 py-0.5',
        currentInfoBanner.type === 'warning' ? 'bg-warning/35' : 'bg-secondary/35',
      )}
    >
      <div className="relative flex min-h-8 items-center justify-center">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-2 pr-10 text-center">
          <p className="text-sm leading-5 xs:text-xs font-medium">{currentInfoBanner.message}</p>
          {currentInfoBanner.buttonLabel && currentInfoBanner.buttonUrl ? (
            <Button asChild size="sm" className="shrink-0">
              <Link href={currentInfoBanner.buttonUrl} target="_blank" rel="noopener noreferrer">
                {currentInfoBanner.buttonLabel}
              </Link>
            </Button>
          ) : null}
        </div>
        <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleDismiss}
            aria-label={tInfoBanner('close')}
            className="rounded-full"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
