'use client';

import React from 'react';

import {
  SMALL_TEXT_INPUT_FIELDS_LIMIT,
  TEXT_INPUT_FIELDS_LENGTH_LIMIT,
} from '@/configuration-text-inputs/const';
import { cn } from '@/utils/tailwind';
import { inputFieldClassName, labelClassName } from '@/utils/tailwind/input';

export type TextInputType = 'text' | 'textarea';

export type TextInputProps<T extends HTMLTextAreaElement | HTMLInputElement> = Omit<
  React.InputHTMLAttributes<T>,
  'type'
> & {
  getValue: () => string;
  label: string;
  inputType?: TextInputType;
  readOnly?: boolean;
  maxLength?: number;
  rows?: number;
  className?: string;
  containerClassName?: string;
  labelClassName?: string;
  inputClassName?: string;
};

export function TextInput<T extends HTMLTextAreaElement | HTMLInputElement>({
  label,
  inputType = 'text',
  readOnly = false,
  className,
  rows = 5,
  containerClassName,
  labelClassName: customLabelClassName,
  inputClassName: customInputClassName,
  getValue,
  ...props
}: TextInputProps<T>) {
  const id = props.id || props.name;
  const defaultMaxLength =
    inputType === 'textarea' ? TEXT_INPUT_FIELDS_LENGTH_LIMIT : SMALL_TEXT_INPUT_FIELDS_LIMIT;

  const effectiveMaxLength: number | undefined = props.maxLength ?? defaultMaxLength;
  const [invalid, setInvalid] = React.useState(false);
  const [counterVisible, setCounterVisible] = React.useState(false);
  const [currentLength, setCurrentLength] = React.useState(getValue().length);

  const updateCounterVisible = () => {
    setCounterVisible(
      effectiveMaxLength !== undefined &&
        (inputType === 'textarea' || effectiveMaxLength - currentLength < 10),
    );
  };

  const handleFocus = () => {
    updateCounterVisible();
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setCurrentLength(newValue.length);
    updateCounterVisible();
    if (newValue.trim().length === 0 && props.required) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    if (props.onChange) {
      props.onChange(e as React.ChangeEvent<T>);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const currentValue = getValue();
    setCounterVisible(false);
    // if (currentValue === e.target.value) return;
    if (currentValue.trim().length === 0 && props.required) {
      e.preventDefault();
      e.stopPropagation();
      setInvalid(true);
      return;
    }
    if (props.onBlur !== undefined) {
      props.onBlur(e as React.FocusEvent<T, Element>);
    }
  };

  const borderErrorClass = invalid ? 'border-coral focus:border-coral' : '';

  const borderLongTextClass =
    effectiveMaxLength !== undefined && effectiveMaxLength === currentLength
      ? 'border-coral focus:border-coral'
      : '';

  return (
    <div className={cn('flex flex-col gap-4', containerClassName, className)}>
      <label htmlFor={id} className={cn(labelClassName, 'text-sm', customLabelClassName)}>
        {label} {props.required && <span className="text-coral">*</span>}
      </label>
      <div className="relative">
        {inputType === 'textarea' ? (
          <>
            <textarea
              className={cn(
                'w-full',
                inputFieldClassName,
                'focus:border-primary placeholder:text-gray-400',
                customInputClassName,
                'resize-none',
                borderErrorClass,
                borderLongTextClass,
                readOnly && 'text-gray-400',
              )}
              rows={rows}
              readOnly={readOnly}
              maxLength={effectiveMaxLength}
              {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            {counterVisible && (
              <span
                className={cn(
                  'text-sm absolute bottom-3 right-3',
                  currentLength === effectiveMaxLength ? 'text-coral' : 'text-primary',
                )}
              >
                {currentLength}/{effectiveMaxLength}
              </span>
            )}
          </>
        ) : (
          <>
            <input
              type="text"
              className={cn(
                'w-full',
                inputFieldClassName,
                'focus:border-primary placeholder:text-gray-400',
                customInputClassName,
                borderErrorClass,
                borderLongTextClass,
                counterVisible ? 'pr-14' : '',
                readOnly && 'text-gray-400',
              )}
              readOnly={readOnly}
              {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
              maxLength={effectiveMaxLength}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            {counterVisible && (
              <span
                className={cn(
                  'text-sm absolute bottom-1/2 translate-y-1/2 right-3',
                  currentLength === effectiveMaxLength ? 'text-coral' : 'text-primary',
                )}
              >
                {currentLength}/{effectiveMaxLength}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
