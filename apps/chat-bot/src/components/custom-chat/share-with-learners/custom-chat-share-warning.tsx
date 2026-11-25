'use client';

import { WarningIcon } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertIcon } from '@ui/components/alert';

export function CustomChatShareWarning({ info }: { info: string }) {
  return (
    <Alert variant="warning">
      <AlertIcon>
        <WarningIcon className="text-warning" size={24} />
      </AlertIcon>
      <AlertDescription>{info}</AlertDescription>
    </Alert>
  );
}
