import { InvalidArgumentError } from '@shared/error';
import { logError } from '@shared/logging';

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
