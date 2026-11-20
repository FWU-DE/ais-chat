'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import { ForbiddenError } from '@shared/error/forbidden-error';

import { requireAuth } from '@/auth/requireAuth';

import { type AssistantMessage, chatWithImageAssistant } from './image-assistant-service';

export async function imageAssistantAction(messages: AssistantMessage[], initialPrompt?: string) {
  const { federalState } = await requireAuth();
  if (!(federalState.featureToggles.isImageAssistantEnabled ?? false)) {
    throw new ForbiddenError('Image assistant is not enabled for this federal state');
  }
  return runServerAction(
    'imageAssistantAction',
    chatWithImageAssistant,
  )({
    messages,
    initialPrompt,
    federalStateId: federalState.id,
  });
}
