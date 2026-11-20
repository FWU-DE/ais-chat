'use client'; // Error boundaries must be Client Components

import { logError } from '@shared/logging';
import { useEffect } from 'react';

/**
 * Error boundary component that displays error information and logs errors for debugging.
 *
 * The logging statement is placed in a useEffect hook to ensure it only runs when the error
 * changes, preventing duplicate log entries on re-renders. This follows React's best practices
 * for side effects and ensures consistent error logging behavior.
 *
 * @param props - Component props
 * @param props.error - The error object containing name, message, stack trace, and optional digest
 * @param props.reset - Function to reset the error boundary (currently unused in implementation)
 * @returns JSX element displaying error details in a user-friendly format
 */
export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError('Error caught by topmost Error component', error);
  }, [error]);

  return (
    <div>
      <h1>Ein Fehler ist aufgetreten!</h1>
      {error.name && <pre>Name: {error.name}</pre>}
      {error.message && <pre>Message: {error.message}</pre>}
      {error.stack && <pre>Stack: {error.stack}</pre>}
    </div>
  );
}
