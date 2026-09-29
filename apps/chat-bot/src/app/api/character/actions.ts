'use server';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { sendCharacterMessage } from './character-chat-service';
import { ChatMessage, createErrorResult, SendMessageResult } from '@/types/chat';
import { SharedChatExpiredError } from '@ais-chat/ai-core/errors';
import * as Sentry from '@sentry/nextjs';
import { runServerAction } from '@shared/actions/run-server-action';
import { generateSpeech } from '@/app/api/chat/speech-service';
import {
  GENERATE_CHARACTER_SPEECH_ACTION_NAME,
  SEND_CHARACTER_MESSAGE_ACTION_NAME,
} from '@/server-action-names';

export type { ChatMessage, SendMessageResult } from '@/types/chat';

export async function sendCharacterMessageAction({
  characterId,
  inviteCode,
  messages,
  modelId,
  fileIds,
  sharedSessionId,
}: {
  characterId: string;
  inviteCode: string;
  messages: ChatMessage[];
  modelId: string;
  fileIds?: string[];
  sharedSessionId?: string;
}): Promise<SendMessageResult> {
  try {
    await requireValidInviteCode(inviteCode);
  } catch {
    return createErrorResult(new SharedChatExpiredError());
  }

  return Sentry.withServerActionInstrumentation(SEND_CHARACTER_MESSAGE_ACTION_NAME, () =>
    sendCharacterMessage({
      characterId,
      inviteCode,
      messages,
      modelId,
      fileIds,
      sharedSessionId,
    }),
  );
}

export async function generateCharacterSpeechAction({
  text,
  inviteCode,
}: {
  text: string;
  inviteCode: string;
}) {
  await requireValidInviteCode(inviteCode);
  return runServerAction(GENERATE_CHARACTER_SPEECH_ACTION_NAME, generateSpeech)({ text });
}
