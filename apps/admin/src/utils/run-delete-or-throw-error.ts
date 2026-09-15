import { InvalidArgumentError } from '@shared/error';
import { logError } from '@shared/logging';

/**
 * Maps *any* delete failure to an InvalidArgumentError with the given message.
 * Non-FK errors (DB outage, races, bugs) are shown as it too; the original
 * error is logged for diagnosis.
 */
export async function runDeleteOrThrowError<T>(
  deleteFn: () => Promise<T>,
  errorMessage: string,
): Promise<T> {
  try {
    return await deleteFn();
  } catch (error) {
    logError(errorMessage, error);
    throw new InvalidArgumentError(errorMessage);
  }
}
