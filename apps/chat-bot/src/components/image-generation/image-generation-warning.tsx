'use client';

import React from 'react';
import { WarningIcon } from '@phosphor-icons/react';

interface ImageGenerationWarningProps {
  message: string;
}

export function ImageGenerationWarning({ message }: ImageGenerationWarningProps) {
  return (
    <div className="mt-6 w-full">
      <div className="border text-yellow-500 border-yellow-500 bg-yellow-50 rounded-xl py-4 px-6 flex flex-row items-center gap-4">
        <WarningIcon size={32} aria-hidden="true" />
        <p className="text-sm text-black" role="alert">
          {message}
        </p>
      </div>
    </div>
  );
}
