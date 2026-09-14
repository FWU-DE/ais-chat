'use client';

import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/select';

type ImageVersionSelectProps = {
  count: number;
  selectedIndex: number;
  onChange: (index: number) => void;
  disabled?: boolean;
};

export function ImageVersionSelect({
  count,
  selectedIndex,
  onChange,
  disabled,
}: ImageVersionSelectProps) {
  const t = useTranslations('image-generation');

  return (
    <Select
      value={String(selectedIndex)}
      onValueChange={(value) => onChange(Number(value))}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={t('version-select-aria-label')}
        data-testid="image-version-select"
        className="border-primary text-primary rounded-full px-4"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {Array.from({ length: count }, (_, index) => (
            <SelectItem
              key={index}
              value={String(index)}
              data-testid={`image-version-option-${index}`}
            >
              {t('version-option-label', { n: index + 1 })}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
