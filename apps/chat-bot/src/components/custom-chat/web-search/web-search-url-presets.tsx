import { UrlPreset } from '@shared/web-search/url-presets/types';
import { Separator } from '@ui/components/separator';
import { useTranslations } from 'next-intl';

import { WebSearchUrlPresetItem } from './web-search-url-preset-item';

type WebSearchUrlPresetsProps = {
  availablePresets: UrlPreset[];
  selectedWebsites: string[];
  onAddPreset: (preset: UrlPreset) => void;
};

export function WebSearchUrlPresets({
  availablePresets,
  selectedWebsites,
  onAddPreset,
}: WebSearchUrlPresetsProps) {
  const t = useTranslations('custom-chat.web-search');

  return (
    <div>
      <div className="text-base font-medium">{t('presets-title')}</div>
      <ul className="mt-2 [&>li:last-child_[data-slot=separator]]:hidden">
        {availablePresets.map((preset) => (
          <li key={preset.id}>
            <WebSearchUrlPresetItem
              selectedWebsites={selectedWebsites}
              preset={preset}
              onAddPreset={onAddPreset}
            />
            <Separator className="my-4.5" />
          </li>
        ))}
      </ul>
    </div>
  );
}
