import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';

import { Checkbox } from '../checkbox';
import { Field, FieldError, FieldLabel } from '../field';

type CheckboxWithInfoProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
  label: string;
  tooltip: string;
  control: Control<TFieldValues>;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  testId?: string;
};

export default function CheckboxWithInfo<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  label,
  control,
  tooltip,
  disabled,
  onCheckedChange,
  testId,
}: CheckboxWithInfoProps<TFieldValues, TName>) {
  return (
    <div className="flex items-center gap-1">
      <Controller
        name={name}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} orientation="horizontal">
            <Checkbox
              id={field.name + '-checkbox'}
              aria-label={label}
              data-testid={testId}
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked);
                onCheckedChange?.(checked === true);
              }}
              disabled={disabled}
            />
            <FieldLabel htmlFor={field.name + '-checkbox'} size="normal" tooltip={tooltip}>
              {label}
            </FieldLabel>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </div>
  );
}
