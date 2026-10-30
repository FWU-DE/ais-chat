import { MAX_SCALED_IMAGE_DIMENSION } from '@/const';
import { requiredNonEmptyString } from '@shared/utils/zod';
import { z } from 'zod';

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
});

export const sharedChatSpeechRequestSchema = z.object({
  inviteCode: requiredNonEmptyString('inviteCode is required'),
  entityType: z.union([z.literal('character'), z.literal('learningScenario')]),
  entityId: requiredNonEmptyString('entityId is required'),
  text: requiredNonEmptyString('text is required'),
});

export const sharedChatInitialMessageSpeechRequestSchema = z.object({
  inviteCode: requiredNonEmptyString('inviteCode is required'),
  characterId: requiredNonEmptyString('characterId is required'),
});
