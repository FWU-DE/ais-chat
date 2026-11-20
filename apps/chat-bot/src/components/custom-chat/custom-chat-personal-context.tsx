'use client';

import { Card, CardContent } from '@ui/components/card';
import { Switch } from '@ui/components/switch';
import { useTranslations } from 'next-intl';
import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';

import { CustomChatHeading2 } from './custom-chat-heading2';

type CustomChatPersonalContextProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
  control: Control<TFieldValues>;
  onCheckedChange?: (checked: boolean) => void;
};

export function CustomChatPersonalContext<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, onCheckedChange }: CustomChatPersonalContextProps<TFieldValues, TName>) {
  const t = useTranslations('custom-chat.personal-context');

  return (
    <div className="flex flex-col gap-3 mt-10">
      <CustomChatHeading2 text={t('heading')} tooltip={t('heading-tooltip')} />
      <Card>
        <CardContent>
          <Controller
            name={name}
            control={control}
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-2">
                <Switch
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    onCheckedChange?.(checked);
                  }}
                  aria-label={t('heading')}
                  aria-invalid={fieldState.invalid}
                />
                <p className="text-sm text-muted-foreground">{t('description')}</p>
              </div>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
