import { z } from 'zod';

export const requiredNonEmptyString = (error: string) =>
  z
    .custom<string>((value) => typeof value === 'string' && value.trim() !== '', {
      error,
    })
    .transform((value) => value.trim());
