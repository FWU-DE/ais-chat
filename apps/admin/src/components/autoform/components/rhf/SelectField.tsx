import React from 'react';
import type { AutoFormFieldProps } from '@autoform/react';
import { useController } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ais-chat/ui/components/select';

export const SelectField: React.FC<AutoFormFieldProps> = ({
  inputProps,
  error,
  id,
  parsedField,
}) => {
  const { field } = useController({ name: id });
  const { value, onChange, onBlur, name } = field;
  const {
    ref,
    dir,
    'aria-invalid': ariaInvalid,
    ...restInputProps
  } = inputProps as React.ComponentProps<'input'>;
  void ref;
  void dir;

  return (
    <Select
      onValueChange={onChange}
      value={value ?? ''}
      name={name}
      {...(restInputProps as React.ComponentProps<typeof Select>)}
    >
      <SelectTrigger
        id={id}
        aria-invalid={ariaInvalid}
        onBlur={onBlur}
        className={error ? 'border-destructive' : ''}
      >
        <SelectValue placeholder={inputProps?.placeholder ?? 'Select an option'} />
      </SelectTrigger>
      <SelectContent>
        {(parsedField.options || []).map(([key, label], index) => (
          <SelectItem key={`${key}-${index}`} value={label}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
