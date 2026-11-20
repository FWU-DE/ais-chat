import { z } from 'zod';

// Validates that a string is valid JSON, without checking its shape.
export const jsonStringSchema = z.string().refine((str) => {
  if (!str.trim()) return true; // Empty string is valid
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}, 'Muss ein gültiges JSON-Format sein');

// Builds a Zod schema for a JSON-encoded textarea that must parse into a
// value matching `shape`, instead of just checking for *some* valid JSON.
export function createJsonStringSchema<T>(
  shape: z.ZodType<T>,
  invalidShapeMessage: string,
  { allowEmpty = true }: { allowEmpty?: boolean } = {},
) {
  return z.string().superRefine((str, ctx) => {
    if (!str.trim()) {
      if (!allowEmpty) {
        ctx.addIssue({ code: 'custom', message: 'Dieses Feld ist erforderlich' });
      }
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(str);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Muss ein gültiges JSON-Format sein' });
      return;
    }
    if (!shape.validate(parsed)) {
      ctx.addIssue({ code: 'custom', message: invalidShapeMessage });
    }
  });
}

// Reads a JSON-encoded textarea value for cross-field checks, yielding `undefined`
// when it is empty, malformed, or does not match `shape`.
export function parseJsonFormValue<T>(value: string, shape: z.ZodType<T>): T | undefined {
  if (!value.trim()) return undefined;
  try {
    const result = shape.safeParse(JSON.parse(value));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
