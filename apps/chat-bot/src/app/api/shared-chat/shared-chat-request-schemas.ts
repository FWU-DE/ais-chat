import { z } from 'zod';

const requiredNonEmptyString = (error: string) =>
  z
    .custom<string>((value) => typeof value === 'string' && value.trim() !== '', {
      error,
    })
    .transform((value) => value.trim());

export const sharedChatCommonRequestSchema = z.object({
  inviteCode: requiredNonEmptyString('inviteCode is required'),
  sharedSessionId: requiredNonEmptyString('sharedSessionId is required'),
  entityType: z.union([z.literal('character'), z.literal('learningScenario')]),
  entityId: z.uuid('entityId must be a valid UUID'),
});

export const sharedChatUploadFormSchema = sharedChatCommonRequestSchema.extend({
  file: z.custom<File>((value) => value instanceof File, {
    error: 'Invalid or missing file in form data',
  }),
});

export const sharedChatImageRequestSchema = sharedChatCommonRequestSchema.extend({
  fileId: requiredNonEmptyString('fileId is required'),
  width: z.coerce.number().int().positive().max(1000),
  height: z.coerce.number().int().positive().max(1000),
});

export const sharedChatSpeechRequestSchema = z.object({
  inviteCode: requiredNonEmptyString('inviteCode is required'),
  entityType: z.union([z.literal('character'), z.literal('learningScenario')]),
  entityId: z.uuid('entityId must be a valid UUID'),
  text: requiredNonEmptyString('text is required'),
});

export const speechRequestSchema = z.object({
  text: requiredNonEmptyString('text is required'),
});
