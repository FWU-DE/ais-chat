import * as React from 'react';
import { forwardRef, useState } from 'react';

import { cn } from '../lib/utils';

type InputProps = React.ComponentProps<'input'> & {
  showCharacterCount?: boolean;
  maxLength?: number;
  maxLengthErrorMessage?: string;
  wrapperClassName?: string;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
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
    const [isFocused, setIsFocused] = useState(false);

    const charCount = typeof value === 'string' ? value.length : internalCharCount;
    const isMaxLengthReached = maxLength !== undefined && charCount >= maxLength;
    const isCounterVisible = showCharacterCount && isFocused && maxLength !== undefined;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.currentTarget.value;
      setInternalCharCount(newValue.length);
      onChange?.(event);
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(event);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(event);
    };

    return (
      <div className={cn('flex flex-col gap-1', wrapperClassName)}>
        <div className="relative">
          <input
            ref={ref}
            type={type}
            data-slot="input"
            className={cn(
              'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-11 w-full min-w-0 rounded-lg border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
              'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
              isCounterVisible && 'pr-14',
              isMaxLengthReached && isFocused && 'border-destructive',
              className,
            )}
            value={value}
            maxLength={maxLength}
            {...props}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
          {isCounterVisible && (
            <div
              className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none',
                isMaxLengthReached ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {charCount}/{maxLength}
            </div>
          )}
        </div>
        {isMaxLengthReached && isFocused && maxLengthErrorMessage && (
          <p className="text-destructive text-xs" aria-live="polite">
            {maxLengthErrorMessage}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

export { Input };
