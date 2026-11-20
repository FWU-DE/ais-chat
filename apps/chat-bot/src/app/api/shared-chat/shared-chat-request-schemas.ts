import { requiredNonEmptyString } from '@shared/utils/zod';
import { z } from 'zod';

import { MAX_SCALED_IMAGE_DIMENSION } from '@/const';

export const sharedChatCommonRequestSchema = z.object({
  inviteCode: requiredNonEmptyString('inviteCode is required'),
  sharedSessionId: requiredNonEmptyString('sharedSessionId is required'),
  entityType: z.union([z.literal('character'), z.literal('learningScenario')]),
  entityId: requiredNonEmptyString('entityId is required'),
});

export const sharedChatUploadFormSchema = sharedChatCommonRequestSchema.extend({
  file: z.custom<File>((value) => value instanceof File, {
    error: 'Invalid or missing file in form data',
  }),
});

export const sharedChatImageRequestSchema = sharedChatCommonRequestSchema.extend({
  fileId: requiredNonEmptyString('fileId is required'),
  width: z.coerce.number().int().positive().max(MAX_SCALED_IMAGE_DIMENSION),
  height: z.coerce.number().int().positive().max(MAX_SCALED_IMAGE_DIMENSION),
  export: z.literal('true').optional(),
});
