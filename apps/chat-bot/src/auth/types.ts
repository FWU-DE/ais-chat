import { userSchema } from '@shared/auth/user-model';
import { federalStateSelectSchema } from '@shared/db/schema';
import { z } from 'zod';

const obscuredFederalStateSchema = federalStateSelectSchema
  .omit({
    apiKeyId: true,
  })
  .extend({
    hasApiKeyAssigned: z.boolean(),
  });

export const userAndContextSchema = userSchema.extend({
  federalState: obscuredFederalStateSchema,
});

export type UserAndContext = z.infer<typeof userAndContextSchema>;
