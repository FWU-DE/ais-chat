'use client';

import { Switch } from '@ui/components/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/select';
import { useTranslations } from 'next-intl';
import { Control, FieldPath, FieldValues, useController } from 'react-hook-form';
import type { SpeechFields } from './speech.types';

export type SpeechEditViewProps<TFieldValues extends FieldValues = FieldValues> = {
  onCheckedChange: (checked: boolean) => void;
  onVoiceChange?: (voice: string) => void;
  voices: string[];
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
  const { field: voiceField } = useController({
    name: 'voice' as FieldPath<TFieldValues & SpeechFields>,
    control: props.control,
  });

  const isEnabled = field.value === true;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <Switch
        checked={isEnabled}
        onCheckedChange={(checked) => {
          field.onChange(checked);
          props.onCheckedChange?.(checked);
        }}
        aria-label={t('heading')}
        aria-invalid={fieldState.invalid}
      />

      {isEnabled && props.voices.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{t('voice-label')}</span>
          <Select
            value={voiceField.value || undefined}
            onValueChange={(value) => {
              voiceField.onChange(value);
              props.onVoiceChange?.(value);
            }}
          >
            <SelectTrigger aria-label={t('voice-label')} data-testid="speech-voice-select">
              <SelectValue placeholder={t('voice-placeholder')} />
            </SelectTrigger>
            <SelectContent align="start">
              {props.voices.map((voice) => (
                <SelectItem key={voice} value={voice}>
                  {voice}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
