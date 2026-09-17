import React from 'react';
import { PlusIcon } from 'lucide-react';
import type { ArrayWrapperProps } from '@autoform/react';
import { Button } from '@ais-chat/ui/components/button';

export const ArrayWrapper: React.FC<ArrayWrapperProps> = ({
  label,
  error,
  children,
  onAddItem,
  inputProps,
  parsedField,
}) => {
  const { key, ref, ...props } = inputProps;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h3
          className={`rounded-md px-2 py-1 text-md font-medium transition-colors focus:outline-none ${
            error
              ? 'focus:border focus:border-destructive focus:ring-1 focus:ring-destructive/50'
              : ''
          }`}
          ref={ref}
          tabIndex={-1}
          aria-describedby={`${key}-error ${key}-description`}
        >
          {label}
          {parsedField.required && <span className="text-destructive"> *</span>}
        </h3>
        {parsedField.fieldConfig?.description && (
          <div className="text-muted-foreground text-sm" id={`${key}-description`}>
            {parsedField.fieldConfig.description}
          </div>
        )}
        {error && (
          <div className="text-destructive text-sm" id={`${key}-error`}>
            {error}
          </div>
        )}
      </div>
      {children}
      <Button
        {...props}
        size="sm"
        type="button"
        variant="outline"
        onClick={(event) => {
          event.currentTarget.blur();
          onAddItem();
        }}
        aria-label={`add ${label}`}
      >
        <PlusIcon className="h-4 w-4" />
      </Button>
    </div>
  );
};
