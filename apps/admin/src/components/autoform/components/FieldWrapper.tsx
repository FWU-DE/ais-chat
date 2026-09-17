import React from 'react';
import type { FieldWrapperProps } from '@autoform/react';
import { Label } from '@ais-chat/ui/components/label';

const DISABLED_LABELS = ['boolean', 'object', 'array'];
const DISABLE_HELPER_TEXT = ['object', 'array'];

export const FieldWrapper: React.FC<FieldWrapperProps> = ({
  id,
  label,
  error,
  children,
  parsedField,
}) => {
  const isDisabled = DISABLED_LABELS.includes(parsedField.type);
  const hideHelperText = DISABLE_HELPER_TEXT.includes(parsedField.type);

  return (
    <div className="flex flex-col gap-2">
      {!isDisabled && (
        <Label htmlFor={id}>
          {label}
          {parsedField.required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      {children}
      {!hideHelperText && parsedField.fieldConfig?.description && (
        <div className="text-muted-foreground text-sm">{parsedField.fieldConfig.description}</div>
      )}
      {!hideHelperText && error && <div className="text-destructive text-sm">{error}</div>}
    </div>
  );
};
