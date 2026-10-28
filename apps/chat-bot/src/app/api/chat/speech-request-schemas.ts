import { requiredNonEmptyString } from '@shared/utils/zod';
import { z } from 'zod';

export const speechRequestSchema = z.object({
  conversationId: z.string().optional(),
  text: requiredNonEmptyString('text is required'),
  voice: z.string().optional(),
});

export const speechWithConversationIdRequestSchema = speechRequestSchema.extend({
  conversationId: requiredNonEmptyString('conversationId is required'),
});

export const speechPreviewRequestSchema = z.object({
  voice: requiredNonEmptyString('voice is required'),
});

export const initialMessageSpeechRequestSchema = z.object({
  characterId: requiredNonEmptyString('characterId is required'),
});
