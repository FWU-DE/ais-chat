'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { Control, Controller, FieldPath, FieldValues, useWatch } from 'react-hook-form';

import { Field, FieldDescription, FieldError, FieldLabel } from '../field';
import { Input } from '../input';
import { Textarea } from '../textarea';

export type FormFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  /** Field name from the form schema */
  name: TName;
  /** React Hook Form control object */
  control: Control<TFieldValues>;
  /** Translated label text */
  label: string;
  /** Description text displayed below the label */
  description?: string;
  /** Tooltip text displayed next to the label */
  tooltip?: string;
  /** Optional action element rendered on the right side of the label row */
  labelAction?: ReactNode;
  /** Optional wrapper function rendered around the input, allowing consumers to place elements alongside it */
  children?: (input: ReactNode) => ReactNode;
  /** Input type: 'text', 'textArea', 'number', 'email', 'password', 'checkbox', 'url', or 'datetime-local' */
  type?:
    'text' | 'textArea' | 'number' | 'email' | 'password' | 'checkbox' | 'url' | 'datetime-local';
  /** Whether the field is required */
  required?: boolean;
  /** Maximum number of characters allowed */
  maxLength?: number;
  /** Error message shown when maxLength is reached */
  maxLengthErrorMessage?: string;
  /** Translated placeholder text */
  placeholder?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Callback when field loses focus */
  onBlur?: () => void;
  /** CSS class name applied to the input component */
  className?: string;
  /** CSS class name applied to the input wrapper element */
  wrapperClassName?: string;
  /** Test ID for the input element */
  testId?: string;
  /** When true, automatically focuses the input when its value is empty */
  autoFocusWhenEmpty?: boolean;
};

const identityWrapper = (input: ReactNode) => input;

/**
 * Reusable form field component that automatically handles validation display,
 * maxLength constraints, error messages, and supports multiple input types.
 */
export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  control,
  label,
  description,
  tooltip,
  labelAction,
  children = identityWrapper,
  type = 'text',
  required,
  maxLength,
  maxLengthErrorMessage,
  placeholder,
  disabled = false,
  onBlur,
  className,
  wrapperClassName,
  testId,
  autoFocusWhenEmpty,
}: FormFieldProps<TFieldValues, TName>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const value = useWatch({ control, name });

  useEffect(() => {
    const isEmptyValue = value === null || value === undefined || !String(value).trim();
    if (autoFocusWhenEmpty && isEmptyValue) {
      (type === 'textArea' ? textareaRef : inputRef).current?.focus();
    }
  }, [autoFocusWhenEmpty, value, type]);

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const sharedProps = {
          autoComplete: 'off',
          className,
          id: field.name,
          maxLength,
          maxLengthErrorMessage,
          placeholder,
          required,
          disabled,
          'aria-invalid': fieldState.invalid,
          'aria-label': label,
          'data-testid': testId,
          ...(!onBlur
            ? {}
            : {
                onBlur: () => {
                  field.onBlur();
                  onBlur();
                },
              }),
        };

        const inputElement =
          type === 'textArea' ? (
            <Textarea {...field} {...sharedProps} ref={textareaRef} />
          ) : (
            <Input
              {...field}
              {...sharedProps}
              type={type}
              ref={inputRef}
              wrapperClassName={wrapperClassName}
              onChange={(e) => {
                if (type === 'number') {
                  field.onChange(e.target.valueAsNumber);
                } else {
                  field.onChange(e.target.value);
                }
              }}
              onWheel={(e) => type === 'number' && (e.target as HTMLElement).blur()}
            />
          );

        return (
          <Field data-invalid={fieldState.invalid} aria-required={required}>
            <FieldLabel
              htmlFor={field.name}
              required={required}
              tooltip={tooltip}
              labelAction={labelAction}
            >
              {label}
            </FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
            {children(inputElement)}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        );
      }}
    />
  );
}
