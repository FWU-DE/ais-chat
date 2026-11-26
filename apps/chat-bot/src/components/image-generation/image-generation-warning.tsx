'use client';

import { WarningIcon } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertIcon } from '@ui/components/alert';

interface ImageGenerationWarningProps {
  message: string;
}

export function ImageGenerationWarning({ message }: ImageGenerationWarningProps) {
  return (
    <Alert variant="warning" className="mt-6">
      <AlertIcon>
        <WarningIcon className="text-warning" size={24} />
      </AlertIcon>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
