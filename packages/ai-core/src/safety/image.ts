import type { ImageGenerationInputImage } from '../images/types';
import type { SafetyMessage } from './types';

export function buildImageSafetyMessages(
  prompt: string,
  inputImages: ImageGenerationInputImage[] = [],
): SafetyMessage[] {
  return [
    {
      role: 'user',
      content: prompt,
      images: inputImages.map((image) => ({
        type: 'image' as const,
        contentType: image.mimeType,
        url: `data:${image.mimeType};base64,${image.data.toString('base64')}`,
      })),
    },
  ];
}
