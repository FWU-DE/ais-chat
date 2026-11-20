'use client';

import type { WebSearchScope } from '@shared/db/schema';
import { Switch } from '@ui/components/switch';
import { useTranslations } from 'next-intl';
import { Control, FieldPath, FieldValues, useController } from 'react-hook-form';

import type { WebSearchFields } from './web-search.types';
import { WebSearchIncludedDomains } from './web-search-included-domains';
import { WebSearchScopeOptions } from './web-search-scope-options';

export type WebSearchEditViewProps<TFieldValues extends FieldValues = FieldValues> = {
  onCheckedChange: (checked: boolean) => void;
  onChange: () => void;
  control: Control<TFieldValues & WebSearchFields>;
};

function WebSearchScopeSection<TFieldValues extends FieldValues = FieldValues>({
  control,
  onChange,
}: {
  control: Control<TFieldValues & WebSearchFields>;
  onChange?: () => void;
}) {
  const { field: scopeField } = useController({
    name: 'webSearchScope' as FieldPath<TFieldValues & WebSearchFields>,
    control,
  });
  const scopeValue = (scopeField.value as WebSearchScope) ?? 'all-web';

  return (
    <>
      <WebSearchScopeOptions
        scopeValue={scopeValue}
        onScopeChange={(value) => {
          scopeField.onChange(value);
          onChange?.();
        }}
      />
      {scopeValue === 'included-domains' && (
        <WebSearchIncludedDomains control={control} onChange={onChange} />
      )}
    </>
  );
}

export function WebSearchEditView<TFieldValues extends FieldValues = FieldValues>(
  props: WebSearchEditViewProps<TFieldValues>,
) {
  const t = useTranslations('custom-chat.web-search');
  const { field, fieldState } = useController({
    name: 'isWebSearchEnabled' as FieldPath<TFieldValues & WebSearchFields>,
    control: props.control,
  });

  return (
    <div className="flex flex-col gap-6">
      <Switch
        checked={field.value === true}
        onCheckedChange={(checked) => {
          field.onChange(checked);
          props.onCheckedChange?.(checked);
          props.onChange?.();
        }}
        aria-label={t('heading')}
        aria-invalid={fieldState.invalid}
      />
      {field.value === true && (
        <WebSearchScopeSection control={props.control} onChange={props.onChange} />
      )}
    </div>
  );
}
