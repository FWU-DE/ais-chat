import { CONVERSATION_ROLES } from '@ais-chat/ai-core/chat/types';
import { z } from 'zod';

export const conversationRoleSchema = z.enum(CONVERSATION_ROLES);

const fileMetadataSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  size: z.number(),
});
export type FileMetadata = z.infer<typeof fileMetadataSchema>;

const conversationMessageMetadataSchema = z.object({
  files: z.array(fileMetadataSchema),
  directories: z.array(z.string()).optional().nullable(),
  integrations: z.array(z.string()).optional().nullable(),
});
export type ConversationMessageMetadata = z.infer<typeof conversationMessageMetadataSchema>;

export const conversationMessageSchema = z.object({
  content: z.string(),
  role: conversationRoleSchema,
  metadata: conversationMessageMetadataSchema.optional().nullable(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const conversationTypeSchema = z.enum(['chat', 'image-generation']);
export type ConversationType = z.infer<typeof conversationTypeSchema>;

export type ImageStyle = {
  name: ImageStyleType;
  displayName: string;
  prompt: string;
};

export const imageStyleTypeSchema = z.enum(['none', 'photorealistic', 'cartoon']);
export type ImageStyleType = z.infer<typeof imageStyleTypeSchema>;

export const imageAspectRatioPresetSchema = z.enum(['quadratic', 'landscape', 'portrait']);
export type ImageAspectRatioPreset = z.infer<typeof imageAspectRatioPresetSchema>;
