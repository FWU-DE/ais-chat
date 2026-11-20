import { v4 as generateUUIDv4, validate as validateUUID } from 'uuid';

export function generateUUID(): string {
  return generateUUIDv4();
}

export function isUUID(uuid: string): boolean {
  return validateUUID(uuid);
}
