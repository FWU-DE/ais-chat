'use client';

import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { Card, CardContent } from '@ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/collapsible';
import { Textarea } from '@ui/components/textarea';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { useController } from 'react-hook-form';
import { CustomChatHeading2 } from './custom-chat-heading2';

type CustomChatCollapsibleTextareaFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  tooltip?: string;
  toggleAriaLabel: string;
  maxLength: number;
  maxLengthErrorMessage: string;
  toggleTestId: string;
  inputTestId: string;
  onBlur: () => void;
  children?: ReactNode;
};

export function CustomChatCollapsibleTextareaField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  tooltip,
  toggleAriaLabel,
  maxLength,
  maxLengthErrorMessage,
  toggleTestId,
  inputTestId,
  onBlur,
  children,
}: CustomChatCollapsibleTextareaFieldProps<TFieldValues>) {
  const { field } = useController({ name, control });
  const [isOpen, setIsOpen] = useState(() => String(field.value ?? '').trim() !== '');

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-10 flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <CustomChatHeading2 text={label} tooltip={tooltip} />
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={toggleAriaLabel}
            data-testid={toggleTestId}
          >
            {isOpen ? <CaretUpIcon /> : <CaretDownIcon />}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <Card>
          <CardContent className="flex flex-col gap-4">
            {children}
            <Textarea
              {...field}
              value={field.value ?? ''}
              id={field.name}
              aria-label={label}
              data-testid={inputTestId}
              className="h-27 resize-y"
              maxLength={maxLength}
              maxLengthErrorMessage={maxLengthErrorMessage}
              onBlur={() => {
                field.onBlur();
                onBlur();
              }}
            />
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
