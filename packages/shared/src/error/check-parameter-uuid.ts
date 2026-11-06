import { isUUID } from '@shared/utils/uuid';

import { InvalidArgumentError } from './invalid-argument-error';

export function checkParameterUUID(...uuids: string[]): void {
  for (const uuid of uuids) {
    if (!isUUID(uuid)) throw new InvalidArgumentError('parameter is not a valid uuid');
  }
}
