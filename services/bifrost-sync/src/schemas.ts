import type { BifrostProviderConfig } from '@ais-chat/api-database/bifrost-provider-sync/core';
import { z } from 'zod';

// The shapes mirror `BifrostProviderConfig` in `@ais-chat/api-database`. A field that the sync or
// the read back uses must be valid here, otherwise a bad value fails only after the first writes
// and costs a rollback and a restart of all pods instead of a 422. Unknown fields pass through.

const secretSchema = z.union([
  z.string(),
  z.looseObject({
    value: z.string(),
    env_var: z.string().optional(),
    from_env: z.boolean().optional(),
  }),
]);

const aliasSchema = z.union([
  z.string().min(1),
  z.looseObject({ model_id: z.string().min(1), use_speech_endpoints: z.boolean().optional() }),
]);

const keySchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().min(1),
  value: secretSchema,
  models: z.array(z.string()),
  weight: z.number(),
  enabled: z.boolean().optional(),
  aliases: z.record(z.string(), aliasSchema).optional(),
  azure_key_config: z.looseObject({ endpoint: secretSchema }).optional(),
  vertex_key_config: z
    .looseObject({
      project_id: secretSchema,
      region: secretSchema,
      auth_credentials: secretSchema.optional(),
    })
    .optional(),
});

const allowedRequestsSchema = z.looseObject({
  list_models: z.boolean(),
  chat_completion: z.boolean(),
  chat_completion_stream: z.boolean(),
  responses: z.boolean(),
  responses_stream: z.boolean(),
  embedding: z.boolean(),
  image_generation: z.boolean(),
});

const promptCacheSchema = z.looseObject({
  auto_inject: z.boolean(),
  ttl: z.literal('1h').optional(),
  cache_control_injection_points: z
    .array(
      z.looseObject({
        location: z.literal('message'),
        role: z.enum(['system', 'developer', 'user', 'assistant']).optional(),
        index: z.number().int().optional(),
      }),
    )
    .optional(),
});

const providerSchema = z.looseObject({
  provider: z.string().min(1),
  keys: z.array(keySchema),
  prompt_cache: promptCacheSchema.optional(),
  network_config: z
    .looseObject({
      base_url: z.string().optional(),
      allow_private_network: z.boolean().optional(),
    })
    .optional(),
  custom_provider_config: z
    .looseObject({
      base_provider_type: z.literal('openai'),
      allowed_requests: allowedRequestsSchema.optional(),
    })
    .optional(),
});

// Two entries for one provider id, or two keys that differ only in case, make the sync write the
// same key twice at once. The key name is the identity the sync matches on, in lower case. A
// duplicate in the baseline would break the rollback in the same way.
const providersSchema = z.array(providerSchema).superRefine((providers, ctx) => {
  const providerIds = new Set<string>();
  providers.forEach((config, index) => {
    if (providerIds.has(config.provider)) {
      ctx.addIssue({ code: 'custom', path: [index, 'provider'], message: 'duplicate provider id' });
    }
    providerIds.add(config.provider);

    const keyNames = new Set<string>();
    config.keys.forEach((key, keyIndex) => {
      const name = key.name.toLowerCase();
      if (keyNames.has(name)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'keys', keyIndex, 'name'],
          message: 'duplicate key name (case-insensitive) within the provider',
        });
      }
      keyNames.add(name);
    });
  });
});

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
