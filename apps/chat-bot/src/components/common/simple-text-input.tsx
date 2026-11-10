import React, { forwardRef } from 'react';

import { cn } from '@/utils/tailwind';
import { inputFieldClassName, labelClassName } from '@/utils/tailwind/input';

interface SimpleTextInputProps extends React.ComponentProps<'input'> {
  label?: React.ReactNode;
}

const SimpleTextInput = forwardRef<HTMLInputElement, SimpleTextInputProps>(
  ({ label, className, value, id, ...props }, ref) => {
    return (
      <>
        {label && (
          <label htmlFor={id} className={cn(labelClassName, 'text-sm')}>
            {label} {props.required && <span className="text-coral">*</span>}
          </label>
        )}
        <input
          type="text"
          className={cn(
            inputFieldClassName,
            value === undefined || value.toString().length < 1 ? 'h-10' : 'h-fit',
            className,
          )}
          value={value}
          ref={ref}
          {...props}
        />
      </>
    );
  },
);

SimpleTextInput.displayName = 'SimpleTextInput';

export default SimpleTextInput;
