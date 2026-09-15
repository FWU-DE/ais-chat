import { z } from 'zod';

const requiredNonEmptyString = (message: string) =>
  z
    .custom<string>((value) => typeof value === 'string' && value.trim() !== '', {
      message,
    })
    .transform((value) => value.trim());

export const sharedChatCommonRequestSchema = z.object({
  inviteCode: requiredNonEmptyString('inviteCode is required'),
  sharedSessionId: requiredNonEmptyString('sharedSessionId is required'),
  entityType: z.union([z.literal('character'), z.literal('learningScenario')]),
  entityId: requiredNonEmptyString('entityId is required'),
});

export const sharedChatUploadFormSchema = sharedChatCommonRequestSchema.extend({
  file: z.custom<File>((value) => value instanceof File, {
    message: 'Invalid or missing file in form data',
  }),
});

export const sharedChatSignedUrlsRequestSchema = sharedChatCommonRequestSchema.extend({
  fileIds: z
    .array(requiredNonEmptyString('fileIds must not contain empty values'))
    .min(1)
    .max(100, 'fileIds must not contain more than 100 entries'),
});
