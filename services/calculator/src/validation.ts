import type { Limits } from './types.js';

export const DEFAULT_LIMITS: Limits = {
  maxExpressionLength: 4096,
  maxBodyBytes: 8192,
  maxOutputBytes: 16384,
  wallTimeMs: 2000,
  concurrency: 4,
  maxQueuedRequests: 32,
};

export type ValidatedRequest = { expression: string };
export type ValidationResult =
  { valid: true; value: ValidatedRequest } | { valid: false; error: string };

export function validateRequest(value: unknown, limits = DEFAULT_LIMITS): ValidationResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'body must be an object' };
  }

  const expression = (value as { expression?: unknown }).expression;
  if (typeof expression !== 'string') {
    return { valid: false, error: 'expression must be a string' };
  }

  const trimmedExpression = expression.trim();
  if (trimmedExpression.length === 0) {
    return { valid: false, error: 'expression must not be empty' };
  }

  if (trimmedExpression.length > limits.maxExpressionLength) {
    return { valid: false, error: 'expression is too long' };
  }

  return { valid: true, value: { expression: trimmedExpression } };
}
