'use client';

import { TEXT_INPUT_FIELDS_LENGTH_LIMIT } from '@/configuration-text-inputs/const';
import { PlusIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { Input } from '@ui/components/input';
import { useTranslations } from 'next-intl';

type WebSearchWebsiteInputProps = {
  currentWebsite: string;
  onCurrentWebsiteChange: (value: string) => void;
  onAddWebsite: () => void;
  isLimitReached: boolean;
};

export function WebSearchWebsiteInput({
  currentWebsite,
  onCurrentWebsiteChange,
  onAddWebsite,
  isLimitReached,
}: WebSearchWebsiteInputProps) {
  const t = useTranslations('custom-chat.web-search');

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <Input
        wrapperClassName="flex-1"
        type="text"
        inputMode="url"
        placeholder={t('websites-placeholder')}
        maxLength={TEXT_INPUT_FIELDS_LENGTH_LIMIT}
        showCharacterCount={false}
        value={currentWebsite}
        disabled={isLimitReached}
        aria-label={t('websites-aria-input')}
        onChange={(e) => onCurrentWebsiteChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAddWebsite();
          }
        }}
      />
      <Button
        className="self-center"
        onClick={onAddWebsite}
        disabled={isLimitReached}
        aria-label={t('websites-add')}
      >
        <PlusIcon />
        {t('websites-add')}
      </Button>
    </div>
  );
}
