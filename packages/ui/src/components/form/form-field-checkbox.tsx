import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';

import { Checkbox } from '../checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '../field';

type FormFieldCheckboxProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
  control: Control<TFieldValues>;
  label: string;
  description?: string;
  disabled?: boolean;
  variant?: 'default' | 'compact';
};

export function FormFieldCheckbox<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  control,
  label,
  description,
  disabled = false,
  variant = 'default',
}: FormFieldCheckboxProps<TFieldValues, TName>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid}>
          {variant !== 'compact' && <FieldLegend variant="label">{label}</FieldLegend>}
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldGroup data-slot="checkbox-group">
            <Field orientation="horizontal">
              <Checkbox
                id={field.name + '-checkbox'}
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
              <FieldLabel htmlFor={field.name + '-checkbox'}>{label}</FieldLabel>
            </Field>
          </FieldGroup>
        </FieldSet>
      )}
    />
  );
}
