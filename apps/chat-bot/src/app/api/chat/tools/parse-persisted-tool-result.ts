import { ToolErrorResult, toolErrorResultSchema } from '@ais-chat/ai-core/chat/types';
import { z } from 'zod';

/**
 * Parses the result shapes shared by every tool. Tools with their own legacy quirks build on top
 * of this in their own `parsePersistedResult`.
 */
const genericPersistedResultSchema = z.union([
  // bare array passed through unchanged (e.g. web_scraper)
  z.array(z.unknown()),
  // bare legacy error string, normalized into `{ error }`
  z.string().transform((message) => ({ error: message })),
  // current `{ error }` shape
  toolErrorResultSchema.loose(),
  // plain success object with no `error` key (the normal shape for most tools' success results)
  z.record(z.string(), z.unknown()),
]);

export function parseGenericPersistedToolResult<T>(raw: unknown): T | ToolErrorResult | undefined {
  const result = genericPersistedResultSchema.safeParse(raw);
  return result.success ? (result.data as T | ToolErrorResult) : undefined;
}

/** Parses a persisted tool-result message's raw JSON content. Returns `undefined` if it isn't valid JSON. */
export function parsePersistedToolResultContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}
