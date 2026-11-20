'use client';

import { WarningIcon } from '@phosphor-icons/react';
import React from 'react';

interface ImageGenerationErrorProps {
  message: string;
}

export function ImageGenerationError({ message }: ImageGenerationErrorProps) {
  return (
    <div className="mt-6 w-full">
      <div className="border text-dark-red border-dark-red bg-light-red rounded-xl py-4 px-6 flex flex-row items-center gap-4">
        <WarningIcon size={32} aria-hidden="true" />
        <p className="text-sm text-black" role="alert">
          {message}
        </p>
      </div>
    </div>
  );
}
