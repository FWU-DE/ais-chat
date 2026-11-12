import { Field, FieldLabel } from '@ui/components/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/select';
import { useTranslations } from 'next-intl';

type TimeLimitSelectProps = {
  label?: string;
  ariaLabel?: string;
  defaultValue: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  usageTimeValuesInMinutes: number[];
  isAdditionalTime?: boolean;
};

export function TimeLimitSelect({
  label,
  ariaLabel,
  defaultValue,
  onChange,
  disabled,
  usageTimeValuesInMinutes,
  isAdditionalTime = false,
}: TimeLimitSelectProps) {
  const t = useTranslations('custom-chat.share-with-learners');

  return (
    <div className="whitespace-nowrap flex-1">
      <Field>
        {label && <FieldLabel>{label}</FieldLabel>}
        <Select
          defaultValue={String(defaultValue)}
          onValueChange={(value) => onChange?.(Number(value))}
          disabled={disabled}
        >
          <SelectTrigger aria-label={ariaLabel} data-testid="usage-time-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {usageTimeValuesInMinutes.map((value) => {
                let displayLabel = `${isAdditionalTime ? '+ ' : ''}${t('minutes-count', {
                  count: value,
                })}`;
                if (value >= 24 * 60) {
                  const days = value / (24 * 60);
                  displayLabel = `${isAdditionalTime ? '+ ' : ''}${t('days-count', {
                    count: days,
                  })}`;
                }
                return (
                  <SelectItem
                    key={value}
                    value={String(value)}
                    data-testid={`usage-time-option-${value}`}
                  >
                    {displayLabel}
                  </SelectItem>
                );
              })}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
