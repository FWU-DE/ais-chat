import React from 'react';
import type { AutoFormFieldProps } from '@autoform/react';
import { useController } from 'react-hook-form';
import { Input } from '@ais-chat/ui/components/input';

export const NumberField: React.FC<AutoFormFieldProps> = ({ inputProps, error, id }) => {
  const { field } = useController({ name: id });

  return (
    <Input
      id={id}
      type="number"
      className={error ? 'border-destructive' : ''}
      {...inputProps}
      {...field}
    />
  );
};
