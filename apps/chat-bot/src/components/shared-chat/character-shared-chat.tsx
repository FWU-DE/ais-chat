'use client';

import { useCharacterChat, type ChatMessage } from '@/hooks/use-chat-hooks';
import { useTranslations } from 'next-intl';
import { CharacterWithShareDataModel } from '@shared/db/schema';
import useBreakpoints from '../hooks/use-breakpoints';
import { AssistantIcon } from '../chat/assistant-icon';
import GenericSharedChat from './generic-shared-chat';
import { reductionBreakpoint } from '@/utils/tailwind/layout';
import { loadSharedChat } from '@/utils/shared-chat-storage';
import { z } from 'zod';

/**
 * This component is used if a character is shared via invite code.
 */
export default function CharacterSharedChat({
  avatarPictureUrl,
  ...character
}: CharacterWithShareDataModel & { inviteCode: string; avatarPictureUrl?: string }) {
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

  return (
    <GenericSharedChat
      headerT={t}
      entity={character}
      inviteCode={inviteCode}
      avatarPictureUrl={avatarPictureUrl}
      chat={chat}
      dialogStartMode="derived"
      assistantIcon={assistantIcon}
      uploadFileFn={uploadSharedCharacterFile}
      showActivityInDialog
    />
  );
}
