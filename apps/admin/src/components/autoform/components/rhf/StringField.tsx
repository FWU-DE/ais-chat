import React from 'react';
import type { AutoFormFieldProps } from '@autoform/react';
import { useController } from 'react-hook-form';
import { Input } from '@ais-chat/ui/components/input';

export const StringField: React.FC<AutoFormFieldProps> = ({ inputProps, error, id }) => {
  const { field } = useController({ name: id });
  const { value, ...rest } = field;

  return (
    <Input
      id={id}
      className={error ? 'border-destructive' : ''}
      value={value ?? ''}
      {...inputProps}
      {...rest}
    />
  );
};
