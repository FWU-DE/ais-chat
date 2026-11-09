import { TrashSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';

import { MAX_WEB_SEARCH_INCLUDED_DOMAINS } from '@/configuration-text-inputs/const';
import { cn } from '@/utils/tailwind';

type WebSearchSelectedWebsitesFooterProps = {
  selectedWebsitesCount: number;
  onClearWebsites: () => void;
};

export function WebSearchSelectedWebsitesFooter({
  selectedWebsitesCount,
  onClearWebsites,
}: WebSearchSelectedWebsitesFooterProps) {
  const t = useTranslations('custom-chat.web-search');

  const isLimitReached = selectedWebsitesCount >= MAX_WEB_SEARCH_INCLUDED_DOMAINS;

  return (
    <div className="flex items-center justify-end gap-2">
      <div className={cn('text-sm', isLimitReached ? 'text-destructive' : 'text-muted-foreground')}>
        {t('websites-counter', {
          count: selectedWebsitesCount,
          max: MAX_WEB_SEARCH_INCLUDED_DOMAINS,
        })}
      </div>
      <Button variant="link" size="sm" onClick={onClearWebsites}>
        <TrashSimpleIcon />
        {t('websites-clear-button')}
      </Button>
    </div>
  );
}
