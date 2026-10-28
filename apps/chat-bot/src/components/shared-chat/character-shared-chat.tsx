'use client';

import { useCharacterChat, type ChatMessage } from '@/hooks/use-chat-hooks';
import { fetchSpeechStream } from '@/utils/audio/fetch-speech-stream';
import { loadSharedChat } from '@/utils/shared-chat-storage';
import { reductionBreakpoint } from '@/utils/tailwind/layout';
import { CharacterWithShareDataModel } from '@shared/db/schema';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { AssistantIcon } from '../chat/assistant-icon';
import useBreakpoints from '../hooks/use-breakpoints';
import GenericSharedChat from './generic-shared-chat';

/**
 * This component is used if a character is shared via invite code.
 */
export default function CharacterSharedChat({
  avatarPictureUrl,
  isSpeechModelEnabled,
  ...character
}: CharacterWithShareDataModel & {
  inviteCode: string;
  avatarPictureUrl?: string;
  isSpeechModelEnabled: boolean;
}) {
  const t = useTranslations('characters.shared');
  const { id, inviteCode, modelId } = character;

  const initialMessages: ChatMessage[] =
    loadSharedChat(inviteCode)?.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      activitySteps: message.activitySteps,
    })) ??
    (character.initialMessage
      ? [{ id: 'initial-message', role: 'assistant', content: character.initialMessage }]
      : []);

  const chat = useCharacterChat({
    characterId: id,
    inviteCode,
    initialMessages,
    modelId: modelId ?? undefined,
  });

  const { isBelow } = useBreakpoints();
  const assistantIcon = AssistantIcon({
    imageName: character.name,
    imageSource: avatarPictureUrl,
    className: isBelow[reductionBreakpoint] ? 'mt-0 mx-0' : undefined,
  });

  async function uploadSharedCharacterFile(
    file: File,
    sharedSessionId: string,
  ): Promise<{ fileId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('inviteCode', inviteCode);
    formData.append('entityType', 'character');
    formData.append('entityId', id);
    formData.append('sharedSessionId', sharedSessionId);

    const response = await fetch('/api/v1/shared-chat/files', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Could not upload file');
    }

    const json = await response.json();
    const parsed = z.object({ fileId: z.string() }).parse(JSON.parse(json?.body));

    return {
      fileId: parsed.fileId,
    };
  }

  async function generateSharedCharacterSpeech(
    text: string,
    isInitialMessage: boolean,
    signal?: AbortSignal,
  ): Promise<Blob> {
    const response = await fetch(
      isInitialMessage
        ? '/api/v1/shared-chat/speech/initial-message'
        : '/api/v1/shared-chat/speech',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify(
          isInitialMessage
            ? { inviteCode, characterId: id }
            : { text, inviteCode, entityType: 'character', entityId: id },
        ),
      },
    );

    if (!response.ok) {
      throw new Error('Could not generate speech');
    }

    return response.blob();
  }

  async function generateSharedCharacterSpeechStream(
    text: string,
    { signal }: { signal: AbortSignal },
  ): Promise<ReadableStream<Uint8Array>> {
    return fetchSpeechStream(
      '/api/v1/shared-chat/speech/stream',
      { text, inviteCode, entityType: 'character', entityId: id },
      signal,
    );
  }

  return (
    <GenericSharedChat
      headerT={t}
      entity={character}
      inviteCode={inviteCode}
      sharedEntityType="character"
      avatarPictureUrl={avatarPictureUrl}
      chat={chat}
      dialogStartMode="derived"
      showActivityDialog
      assistantIcon={assistantIcon}
      uploadFileFn={uploadSharedCharacterFile}
      isSpeechModelEnabled={isSpeechModelEnabled}
      generateSpeechFn={generateSharedCharacterSpeech}
      speechOnly={character.speechOnly}
      generateSpeechStreamFn={generateSharedCharacterSpeechStream}
    />
  );
}
