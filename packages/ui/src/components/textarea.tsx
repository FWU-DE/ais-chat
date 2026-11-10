'use client';

import * as React from 'react';
import { forwardRef, useState } from 'react';

import { cn } from '../lib/utils';

type TextareaProps = React.ComponentProps<'textarea'> & {
  showCharacterCount?: boolean;
  maxLength?: number;
  maxLengthErrorMessage?: string;
  wrapperClassName?: string;
};

/**
 * CAVE: The native textarea is no longer at the root level because the word count should be displayed inside the TextArea component.
 * This can lead to issues with components which try to apply styles directly to the textarea element (via selector, etc.).
 * In such cases, please apply styles to the Textarea component via the wrapperClassName prop or use data-slot="textarea" selector for targeting the textarea element.
 * Example: see InputGroupTextarea component in InputGroup.tsx
 */
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      showCharacterCount = true,
      maxLength,
      maxLengthErrorMessage,
      wrapperClassName,
      value,
      onChange,
      onFocus,
      onBlur,
      ...props
    },
    ref,
  ) => {
    const [internalCharCount, setInternalCharCount] = useState<number>(() => {
      if (typeof value === 'string') return value.length;
      return 0;
    });

    const charCount = typeof value === 'string' ? value.length : internalCharCount;
    const isMaxLengthReached = maxLength !== undefined && charCount >= maxLength;
    const showCounterOnFocus = showCharacterCount && maxLength !== undefined;

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.currentTarget.value;
      setInternalCharCount(newValue.length);
      onChange?.(event);
    };

    return (
      <div className={cn('group/textarea flex flex-col gap-1', wrapperClassName)}>
        <div className="relative">
          <textarea
            ref={ref}
            data-slot="textarea"
            className={cn(
              'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
              showCounterOnFocus && 'group-focus-within/textarea:pb-8',
              isMaxLengthReached && 'focus-visible:border-destructive',
              className,
            )}
            maxLength={maxLength}
            value={value}
            {...props}
            onChange={handleChange}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          {showCounterOnFocus && (
            <div
              className={cn(
                'pointer-events-none absolute bottom-2 right-3 text-xs opacity-0 transition-opacity group-focus-within/textarea:opacity-100',
                isMaxLengthReached ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {charCount}/{maxLength}
            </div>
          )}
        </div>
        {isMaxLengthReached && maxLengthErrorMessage && (
          <p
            className="text-destructive text-xs hidden group-focus-within/textarea:block"
            aria-live="polite"
          >
            {maxLengthErrorMessage}
          </p>
        )}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
