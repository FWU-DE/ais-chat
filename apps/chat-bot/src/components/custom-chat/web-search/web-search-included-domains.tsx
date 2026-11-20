'use client';

import { utils } from '@shared/utils';
import { UrlPreset } from '@shared/web-search/url-presets/types';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Control, FieldPath, FieldValues, useController } from 'react-hook-form';

import { useToast } from '@/components/common/toast';
import { MAX_WEB_SEARCH_INCLUDED_DOMAINS } from '@/configuration-text-inputs/const';

import { useUrlPresets } from './use-url-presets';
import type { WebSearchFields } from './web-search.types';
import { WebSearchSelectedWebsites } from './web-search-selected-websites';
import { WebSearchUrlPresets } from './web-search-url-presets';
import { WebSearchWebsiteInput } from './web-search-website-input';

export function WebSearchIncludedDomains<TFieldValues extends FieldValues>({
  control,
  onChange,
}: {
  control: Control<TFieldValues & WebSearchFields>;
  onChange?: () => void;
}) {
  const t = useTranslations('custom-chat.web-search');
  const toast = useToast();
  const [currentWebsite, setCurrentWebsite] = useState('');
  const { data: availablePresets, isError } = useUrlPresets();
  const { field } = useController({
    name: 'webSearchIncludedDomains' as FieldPath<TFieldValues & WebSearchFields>,
    control,
  });
  const websites = (field.value as string[] | undefined) ?? [];
  const isLimitReached = websites.length >= MAX_WEB_SEARCH_INCLUDED_DOMAINS;

  useEffect(() => {
    if (isError) {
      toast.error(t('websites-presets-load-error'));
    }
  }, [isError, toast, t]);

  function handleAddPreset(preset: UrlPreset) {
    const missingWebsites = preset.urls.filter((url) => !websites.includes(url));
    field.onChange([...websites, ...missingWebsites]);
    onChange?.();
  }

  function handleAddWebsite() {
    if (isLimitReached) {
      return;
    }

    const trimmed = currentWebsite.trim();

    if (trimmed === '') {
      toast.error(t('websites-empty-error'));
      return;
    }

    const normalizedDomain = utils.url.normalizeDomain(trimmed);
    if (normalizedDomain === null) {
      toast.error(t('websites-invalid-error'));
      return;
    }

    if (websites.includes(normalizedDomain)) {
      toast.error(t('websites-duplicate-error'));
      setCurrentWebsite('');
      return;
    }

    field.onChange([...websites, normalizedDomain]);
    setCurrentWebsite('');
    onChange?.();
  }

  function handleDeleteWebsite(website: string) {
    field.onChange(websites.filter((w) => w !== website));
    onChange?.();
  }

  function handleClearWebsites() {
    field.onChange([]);
    onChange?.();
  }

  return (
    <div className="flex flex-col gap-8">
      <WebSearchSelectedWebsites
        availablePresets={availablePresets ?? []}
        selectedWebsites={websites}
        onClearWebsites={handleClearWebsites}
        onDeleteWebsite={handleDeleteWebsite}
      />

      <WebSearchWebsiteInput
        currentWebsite={currentWebsite}
        onCurrentWebsiteChange={setCurrentWebsite}
        onAddWebsite={handleAddWebsite}
        isLimitReached={isLimitReached}
      />

      <WebSearchUrlPresets
        availablePresets={availablePresets ?? []}
        selectedWebsites={websites}
        onAddPreset={handleAddPreset}
      />
    </div>
  );
}
