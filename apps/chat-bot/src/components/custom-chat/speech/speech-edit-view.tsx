'use client';

import { Switch } from '@ui/components/switch';
import { useTranslations } from 'next-intl';
import { Control, FieldPath, FieldValues, useController } from 'react-hook-form';
import type { SpeechFields } from './speech.types';

export type SpeechEditViewProps<TFieldValues extends FieldValues = FieldValues> = {
  onCheckedChange: (checked: boolean) => void;
  control: Control<TFieldValues & SpeechFields>;
};

export function SpeechEditView<TFieldValues extends FieldValues = FieldValues>(
  props: SpeechEditViewProps<TFieldValues>,
) {
  const t = useTranslations('custom-chat.speech');
  const { field, fieldState } = useController({
    name: 'isSpeechEnabled' as FieldPath<TFieldValues & SpeechFields>,
    control: props.control,
  });

  return (
    <Switch
      checked={field.value === true}
      onCheckedChange={(checked) => {
        field.onChange(checked);
        props.onCheckedChange?.(checked);
      }}
      aria-label={t('heading')}
      aria-invalid={fieldState.invalid}
    />
  );
}
