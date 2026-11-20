'use client';
import './citation.css';

import { WebSource } from '@shared/db/types';
import { utils } from '@shared/utils';

import SearchIcon from '@/components/icons/search';
import Spinner from '@/components/icons/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { openInNewTab } from '@/utils/navigation/router';
import { cn } from '@/utils/tailwind';

function truncateText(text: string, maxLength: number) {
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

export default function Citation({
  webSource,
  className,
  isLoading = false,
}: {
  webSource: WebSource;
  className?: string;
  isLoading?: boolean;
}) {
  const displayUrl = utils.url.getDisplayUrl(webSource.link);
  const displayTitle = truncateText(displayUrl, 30);

  return (
    <TooltipProvider skipDelayDuration={0} delayDuration={0}>
      <div
        className={cn(
          'flex flex-row items-center gap-0 p-1 bg-secondary/50 rounded-enterprise-sm',
          className,
        )}
        style={{
          direction: 'ltr',
        }}
        role="button"
        tabIndex={0}
        onClick={() => openInNewTab(webSource.link)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openInNewTab(webSource.link);
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-row items-center gap-1 p-1.5" data-testid="citation">
              <SearchIcon className="w-3 h-3 ml-1" />
              <span className="flex text-ellipsis text-xs line-clamp-1" aria-label={displayUrl}>
                {displayTitle}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent
            asChild
            className={cn(
              'p-2 flex flex-col border-0 bg-white w-60 cursor-pointer text-start citation overflow-hidden',
            )}
          >
            {!webSource.error && (
              <span
                role="button"
                aria-hidden="true"
                onClick={() => openInNewTab(webSource.link)}
                // overwrite direction from parent
                dir="ltr"
              >
                <span className="font-medium text-ellipsis text-sm line-clamp-2">{displayUrl}</span>
              </span>
            )}
          </TooltipContent>
        </Tooltip>
        {isLoading && (
          <div className="p-1">
            <Spinner className="size-4" />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
