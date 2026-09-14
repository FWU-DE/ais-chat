import * as Sentry from '@sentry/nextjs';
import { logError } from '@shared/logging';
import { ServerActionResult } from './server-action-result';
import { BusinessError } from '@shared/error/business-error';
import { UnexpectedError } from '@shared/error/unexpected-error';
import { AiGenerationError } from '@ais-chat/ai-core/errors';

// Helper function to serialize error objects for client transmission
function serializeError(error: BusinessError | AiGenerationError, statusCode: number) {
  return {
    name: error.name,
    message: error.message,
    statusCode,
  };
}

/**
 * Runs a server action with standardized error handling, logging, and Sentry instrumentation.
 *
 * The server action name must be passed explicitly because the callback's function name
 * is resolved only at runtime and can be changed by minification. A string literal
 * keeps Sentry instrumentation names stable across builds.
 */
export function runServerAction<TReturn, TArgs extends readonly unknown[]>(
  serverActionName: string,
  callback: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<ServerActionResult<TReturn>> {
  return async (...args: TArgs) => {
    return Sentry.withServerActionInstrumentation(serverActionName, async () => {
      try {
        const value = await callback(...args);
        return { success: true as const, value };
      } catch (error) {
        if (error instanceof BusinessError) {
          // It is safe to log BusinessError messages because they are meant to be user-friendly
          logError(error.message, error);
          return {
            success: false as const,
            error: serializeError(error, error.statusCode),
          };
        } else if (error instanceof AiGenerationError) {
          logError('AI generation error occurred during server action.', error);
          return {
            success: false as const,
            error: serializeError(error, 500),
          };
        } else {
          // For other errors, log the error
          logError('An unexpected error occurred during server action.', error);
          // Rethrow the error to be handled by higher-level error handlers, e.g. redirect(), notFound(), etc.
          return {
            success: false as const,
            error: new UnexpectedError(),
          };
        }
      }
    });
  };
}
