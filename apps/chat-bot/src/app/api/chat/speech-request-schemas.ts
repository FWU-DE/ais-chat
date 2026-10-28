import { z } from 'zod';
import { requiredNonEmptyString } from '@shared/utils/zod';

export const speechRequestSchema = z.object({
  conversationId: requiredNonEmptyString('conversationId is required'),
  text: requiredNonEmptyString('text is required'),
  voice: z.string().optional(),
});

export const speechPreviewRequestSchema = z.object({
  voice: requiredNonEmptyString('voice is required'),
});

export const initialMessageSpeechRequestSchema = z.object({
  characterId: requiredNonEmptyString('characterId is required'),
});
