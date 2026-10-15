import { MAX_WEB_SEARCH_INCLUDED_DOMAINS } from '@/configuration-text-inputs/const';
import { CaretDownIcon, CaretUpIcon, PlusIcon } from '@phosphor-icons/react';
import { UrlPreset } from '@shared/web-search/url-presets/types';
import { Button } from '@ui/components/button';
import { Chip } from '@ui/components/chip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/collapsible';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type WebSearchUrlPresetItemProps = {
  selectedWebsites: string[];
  preset: UrlPreset;
  onAddPreset: (preset: UrlPreset) => void;
};

export function WebSearchUrlPresetItem({
  selectedWebsites,
  preset,
  onAddPreset,
}: WebSearchUrlPresetItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = useTranslations('custom-chat.web-search');
  const isFullyAdded = preset.urls.every((url) => selectedWebsites.includes(url));

  const isLimitReached = selectedWebsites.length >= MAX_WEB_SEARCH_INCLUDED_DOMAINS;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:flex-wrap">
        <div className="flex gap-2 items-center flex-wrap grow min-w-0">
          <span className="text-sm grow">{preset.name}</span>
          <span className="text-sm whitespace-nowrap">
            {t('presets-domain-count', { count: preset.urls.length })}
          </span>

          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              {isExpanded ? <CaretUpIcon /> : <CaretDownIcon />}
            </Button>
          </CollapsibleTrigger>
        </div>

        <Button
          size="sm"
          className="py-0 self-center sm:self-auto sm:ml-2"
          onClick={() => onAddPreset(preset)}
          disabled={isFullyAdded || isLimitReached}
        >
          <PlusIcon />
          {t('presets-add-preset-button')}
        </Button>
      </div>

      <CollapsibleContent>
        <ul className="flex flex-wrap gap-2 my-4">
          {preset.urls.toSorted().map((url) => (
            <li className="" key={`${preset.id}-${url}`}>
              <Chip href={`https://${url}`} label={url} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
