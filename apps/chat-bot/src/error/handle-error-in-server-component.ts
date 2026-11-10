import { BusinessError, ForbiddenError, InvalidArgumentError, NotFoundError } from '@shared/error';
import { logError } from '@shared/logging';
import { notFound } from 'next/navigation';

/**
 * In server components we handle NotFoundError and ForbiddenError by calling notFound().
 * That displays the nearest not-found.tsx component in the tree.
 * The error message can be logged safely because they do not contain sensitive information.
 *
 * BusinessErrors are re-thrown so the nearest error boundary can catch them.
 * Normally the nearest error.tsx component will be used to display the error.
 * The error message can be logged safely because they are meant to be shown to the user.
 *
 * All other errors are re-thrown so the nearest error boundary can catch them.
 * The error message will be adapted by nextjs to not leak sensitive information.
 */
export function handleErrorInServerComponent(error: unknown): never {
  if (
    error instanceof NotFoundError ||
    error instanceof ForbiddenError ||
    error instanceof InvalidArgumentError
  ) {
    logError(error.message, error);
    notFound();
  } else if (error instanceof BusinessError) {
    logError(error.message, error);
    throw error;
  } else {
    logError('Unexpected error occurred', error);
    throw error;
  }
}
