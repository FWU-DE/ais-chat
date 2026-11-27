import { federalStateSelectSchema } from '@shared/db/schema';
import { z } from 'zod';

export const federalStateSchema = federalStateSelectSchema.extend({
  createdAt: z.coerce.date(),
  hasApiKeyAssigned: z.boolean(),
  apiKeyId: z.string().nullable().optional(),
});

export type FederalStateModel = z.infer<typeof federalStateSchema>;
