'use client';

import React, { forwardRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { cn } from '@/utils/tailwind';

const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, value, ...props }, ref) => {
    return (
      // @ts-expect-error - we need to pass the ref to the TextareaAutosize component
      <TextareaAutosize
        className={cn(
          'w-full py-1.5 border-slate-400 focus:border-yellow-700 focus:outline-hidden resize-none',
          value === undefined || value.toString().length < 1 ? 'h-10' : 'h-fit',
          className,
        )}
        value={value}
        ref={ref}
        {...props}
      />
    );
  },
);

AutoResizeTextarea.displayName = 'AutoResizeTextarea';

export default AutoResizeTextarea;
