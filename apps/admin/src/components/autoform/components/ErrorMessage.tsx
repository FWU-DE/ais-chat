import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertTitle } from '@ais-chat/ui/components/alert';

export const ErrorMessage: React.FC<{ error: string }> = ({ error }) => (
  <Alert variant="destructive">
    <AlertCircle className="mt-2 h-5 w-5" />
    <AlertTitle className="text-sm/5">{error}</AlertTitle>
  </Alert>
);
