'use server';

import { LlmModelSelectModel } from '@shared/db/schema';
import { handleImageGeneration } from './image-generation-service';
import { ImageStyle } from '@shared/utils/chat';
import { runServerAction } from '@shared/actions/run-server-action';
import { requireAuth } from '@/auth/requireAuth';
import { GENERATE_IMAGE_ACTION_NAME } from '@/server-action-names';
import { ImageGenerationOptions } from '@/components/image-generation/image-generation-types';

/**
 * Generates an image within an existing conversation using the image generation service
 * Combines the conversation management with the actual image generation API
 */
export async function generateImageAction({
  prompt,
  model,
  style,
  options,
  inputFileIds = [],
}: {
  prompt: string;
  model: LlmModelSelectModel;
  style?: ImageStyle;
  options: ImageGenerationOptions;
  inputFileIds?: string[];
}) {
  const { user, federalState } = await requireAuth();

  return runServerAction(
    GENERATE_IMAGE_ACTION_NAME,
    handleImageGeneration,
  )({
    prompt,
    model,
    style,
    options,
    inputFileIds,
    userId: user.id,
    federalStateId: federalState.id,
  });
}
