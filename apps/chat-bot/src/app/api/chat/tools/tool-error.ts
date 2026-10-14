import { toolErrorResultSchema } from '@ais-chat/ai-core/chat/types';
import { z } from 'zod';

/** Parses and transforms both legacy and current tool results into the current tool response shape. */
export const legacyToolErrorSchema = z
  .union([
    // Normalizes a bare legacy error string into the `{ error }` shape.
    z.string().transform((message) => ({ error: message })),
    toolErrorResultSchema.loose(),
    // math_calculate: success responses carried a stale `error: null` alongside `status: 'success'`.
    z.object({ error: z.null() }).loose(),
  ])
  .transform((result) => {
    const { error, ...rest } = result as typeof result & {
      truncated?: unknown;
      chunks?: unknown;
    };

    // math_calculate: `error` was always present but null on success, so it carries no information.
    if (error === null) {
      return rest;
    }

    // retrieve_entire_file: truncation was flagged via `truncated: true` alongside `error`.
    if (rest.truncated === true) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { truncated, ...withoutTruncated } = rest;
      return { ...withoutTruncated, notice: error };
    }

    // retrieve_text_chunks: `error` was set to explain why `chunks` came back empty, even
    // though the call succeeded.
    if (Array.isArray(rest.chunks) && rest.chunks.length === 0) {
      return { ...rest, notice: error };
    }

    return { ...rest, error };
  });
