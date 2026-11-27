const JSON_SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
  'null',
]);

function isTypedValueWrapper(value: unknown): value is { type: string; value: unknown } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    keys.includes('type') &&
    keys.includes('value') &&
    typeof (value as { type: unknown }).type === 'string' &&
    JSON_SCHEMA_TYPES.has((value as { type: string }).type)
  );
}

/**
 * Some models (e.g. Llama) echo the JSON schema instead of a plain value and send
 * `{"input": {"type": "string", "value": "value"}}` instead of `{"input": "value"}`.
 * Unwraps such arguments; any other arguments are returned unchanged.
 */
export function unwrapTypedArguments(argumentsJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson);
  } catch {
    return argumentsJson;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return argumentsJson;
  }

  const entries = Object.entries(parsed);
  if (!entries.some(([, value]) => isTypedValueWrapper(value))) {
    return argumentsJson;
  }

  return JSON.stringify(
    Object.fromEntries(
      entries.map(([key, value]) => [key, isTypedValueWrapper(value) ? value.value : value]),
    ),
  );
}
