'use client';
import { Button } from '@ui/components/button';
import { Field, FieldDescription, FieldError, FieldLegend, FieldSet } from '@ui/components/field';
import { Input } from '@ui/components/input';
import {
  ArrayPath,
  Control,
  Controller,
  FieldValues,
  Path,
  useFieldArray,
  UseFieldArrayAppend,
} from 'react-hook-form';

export type FormFieldArrayProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends ArrayPath<TFieldValues> = ArrayPath<TFieldValues>,
> = {
  name: TName;
  control: Control<TFieldValues>;
  label: string;
  description: string;
  inputType?: string;
  defaultAppendValue: Parameters<UseFieldArrayAppend<TFieldValues, TName>>[0];
};

export function FormFieldArray<
  TFieldValues extends FieldValues = FieldValues,
  TName extends ArrayPath<TFieldValues> = ArrayPath<TFieldValues>,
>({
  name,
  label,
  description,
  control,
  inputType = 'text',
  defaultAppendValue,
}: FormFieldArrayProps<TFieldValues, TName>) {
  const { fields, append, remove } = useFieldArray({
    control,
    name,
  });

  return (
    <FieldSet>
      <FieldLegend variant="label">{label}</FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      <div className="flex flex-col gap-2">
        {fields.map((item, index) => (
          <div key={item.id} className="flex gap-2">
            <Controller
              name={`${name}.${index}.value` as Path<TFieldValues>}
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex flex-row gap-2">
                    <Input
                      {...field}
                      id={`${name}.${index}.name`}
                      type={inputType}
                      wrapperClassName="flex-1"
                    />
                    <Button type="button" variant="destructive" onClick={() => remove(index)}>
                      Entfernen
                    </Button>
                  </div>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </Field>
              )}
            />
          </div>
        ))}
        <Button type="button" onClick={() => append(defaultAppendValue)}>
          Hinzufügen
        </Button>
      </div>
    </FieldSet>
  );
}
