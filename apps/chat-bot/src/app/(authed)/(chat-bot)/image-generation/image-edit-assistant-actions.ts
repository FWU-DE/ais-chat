'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import { ForbiddenError } from '@shared/error/forbidden-error';

import { requireAuth } from '@/auth/requireAuth';

import { type AssistantMessage, chatWithImageEditAssistant } from './image-edit-assistant-service';

export async function imageEditAssistantAction(
  messages: AssistantMessage[],
  context: { originalPrompt: string; imageUrl?: string },
) {
  const { federalState } = await requireAuth();
  if (!(federalState.featureToggles.isImageAssistantEnabled ?? false)) {
    throw new ForbiddenError('Image assistant is not enabled for this federal state');
  }
  return runServerAction(
    'imageEditAssistantAction',
    chatWithImageEditAssistant,
  )({
    messages,
    originalPrompt: context.originalPrompt,
    imageUrl: context.imageUrl,
    federalStateId: federalState.id,
  });
}
