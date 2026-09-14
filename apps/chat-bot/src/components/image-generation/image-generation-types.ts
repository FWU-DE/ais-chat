import type { ImageAspectRatioPreset } from '@shared/utils/chat';
import type { ImageAttachment } from '../chat/message-image-attachment';

export type { ImageAspectRatioPreset };

export type ImageGenerationOptions = {
  aspectRatio: ImageAspectRatioPreset;
};

export type ImageVersion = {
  userMessageId: string;
  assistantMessageId: string;
  prompt: string;
  imageUrl: string;
  imageFileId: string;
  attachedFiles: ImageAttachment[];
};
