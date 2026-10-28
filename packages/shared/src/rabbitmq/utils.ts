import crypto from 'crypto';

export function hashWithoutSalt(data: string) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
