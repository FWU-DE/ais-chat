import type { BifrostProviderConfig } from '@ais-chat/api-database/bifrost-provider-sync/core';
import { z } from 'zod';

const secretSchema = z.union([z.string(), z.looseObject({ value: z.string() })]);

const keySchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().min(1),
  value: secretSchema,
  models: z.array(z.string()),
  weight: z.number(),
  enabled: z.boolean().optional(),
});

const providerSchema = z.looseObject({
  provider: z.string().min(1),
  keys: z.array(keySchema),
});

const providersSchema = z.array(providerSchema);

export const syncRequestSchema = z.object({
  contentHash: z.string().min(1),
  providers: providersSchema,
  baseline: z.object({
    contentHash: z.string().min(1),
    providers: providersSchema,
  }),
});

export type SyncRequest = {
  contentHash: string;
  providers: BifrostProviderConfig[];
  baseline: { contentHash: string; providers: BifrostProviderConfig[] };
};

/** Request body validation. Returns issue paths only, never the input (it contains provider keys). */
export function parseSyncRequest(
  body: unknown,
): { ok: true; request: SyncRequest } | { ok: false; issues: string[] } {
  const result = syncRequestSchema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }
  // The schema checks the fields the sync relies on and passes the rest through unchanged.
  return { ok: true, request: result.data };
}
