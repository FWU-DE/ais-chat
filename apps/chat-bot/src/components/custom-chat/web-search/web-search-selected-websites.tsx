'use client';

import { UrlPreset } from '@shared/web-search/url-presets/types';
import { Card, CardContent } from '@ui/components/card';
import { Chip } from '@ui/components/chip';
import { useTranslations } from 'next-intl';

import { WebSearchSelectedWebsitesFooter } from './web-search-selected-websites-footer';

const UNASSIGNED_PRESET_NAME = '__unassigned__';

type WebSearchSelectedWebsitesProps = {
  availablePresets: UrlPreset[];
  selectedWebsites: string[];
  onDeleteWebsite: (website: string) => void;
  onClearWebsites: () => void;
};

export function WebSearchSelectedWebsites({
  availablePresets,
  selectedWebsites,
  onDeleteWebsite,
  onClearWebsites,
}: WebSearchSelectedWebsitesProps) {
  const t = useTranslations('custom-chat.web-search');

  if (selectedWebsites.length === 0) {
    return null;
  }

  const allPresetUrls = new Set(availablePresets.flatMap((preset) => preset.urls));
  const unassignedWebsites = selectedWebsites.filter((website) => !allPresetUrls.has(website));

  const websitesByPreset = new Map<string, string[]>(
    availablePresets
      .map((preset): [string, string[]] => [
        preset.name,
        preset.urls.filter((url) => selectedWebsites.includes(url)),
      ])
      .filter(([, urls]) => urls.length > 0),
  );

  const selectedWebsitesByPresetName =
    unassignedWebsites.length > 0
      ? new Map([[UNASSIGNED_PRESET_NAME, unassignedWebsites], ...websitesByPreset])
      : new Map(websitesByPreset);

  return (
    <div className="flex flex-col gap-1.5">
      <Card className="pt-0 bg-background-2">
        <CardContent>
          {Array.from(selectedWebsitesByPresetName.entries()).map(([presetName, websites]) => {
            return (
              <div key={presetName} className="mt-6">
                <div className="text-xs uppercase text-muted-foreground tracking-wide">
                  {presetName === UNASSIGNED_PRESET_NAME
                    ? t('presets-title-unassigned')
                    : presetName}
                </div>
                <ul className="flex flex-wrap gap-2 mt-3">
                  {websites.map((website) => (
                    <li key={website}>
                      <Chip
                        href={`https://${website}`}
                        label={website}
                        ariaDeleteLabel={t('websites-aria-delete', { website })}
                        onDelete={() => onDeleteWebsite(website)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <WebSearchSelectedWebsitesFooter
        selectedWebsitesCount={selectedWebsites.length}
        onClearWebsites={onClearWebsites}
      />
    </div>
  );
}
