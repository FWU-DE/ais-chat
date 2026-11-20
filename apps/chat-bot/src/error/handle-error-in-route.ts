import {
  ForbiddenError,
  InvalidArgumentError,
  NotFoundError,
  UnauthenticatedError,
} from '@shared/error';
import { logError } from '@shared/logging';

/**
 * Handles errors in route handlers and maps them to appropriate HTTP responses.
 */
export function handleErrorInRoute(error: unknown): Response {
  logError('Error in route handler', error);
  if (error instanceof InvalidArgumentError) {
    return new Response(null, { status: 400 });
  }
  if (error instanceof UnauthenticatedError) {
    return new Response(null, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return new Response(null, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return new Response(null, { status: 404 });
  }
  return new Response(null, { status: 500 });
}
