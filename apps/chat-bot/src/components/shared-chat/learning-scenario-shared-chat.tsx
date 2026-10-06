'use client';

import { useLearningScenarioChat } from '@/hooks/use-chat-hooks';
import { useTranslations } from 'next-intl';
import { LearningScenarioWithShareDataModel } from '@shared/db/schema';
import GenericSharedChat from './generic-shared-chat';
import { loadSharedChat } from '@/utils/shared-chat-storage';
import { z } from 'zod';

export default function LearningScenarioSharedChat({
  avatarPictureUrl,
  isSpeechModelEnabled,
  ...sharedSchoolChat
}: LearningScenarioWithShareDataModel & {
  inviteCode: string;
  avatarPictureUrl?: string;
  isSpeechModelEnabled: boolean;
}) {
  const t = useTranslations('learning-scenarios.shared');
  const { id, inviteCode, modelId } = sharedSchoolChat;

  const initialMessages =
    loadSharedChat(inviteCode)?.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      activitySteps: message.activitySteps,
      toolCalls: message.toolCalls,
      toolCallId: message.toolCallId,
    })) ?? [];

  const chat = useLearningScenarioChat({
    learningScenarioId: id,
    inviteCode,
    initialMessages,
    modelId: modelId ?? undefined,
  });

  async function uploadSharedLearningScenarioFile(
    file: File,
    sharedSessionId: string,
  ): Promise<{ fileId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('inviteCode', inviteCode);
    formData.append('entityType', 'learningScenario');
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

  async function generateSharedLearningScenarioSpeech(text: string): Promise<Blob> {
    const response = await fetch('/api/v1/shared-chat/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, inviteCode, entityType: 'learningScenario', entityId: id }),
    });

    if (!response.ok) {
      throw new Error('Could not generate speech');
    }

    return response.blob();
  }

  return (
    <GenericSharedChat
      headerT={t}
      entity={sharedSchoolChat}
      inviteCode={inviteCode}
      sharedEntityType="learningScenario"
      avatarPictureUrl={avatarPictureUrl}
      chat={chat}
      dialogStartMode="explicit"
      enableFloatingText
      exerciseDescription={sharedSchoolChat.studentExercise}
      exerciseTitle={t('exercise-title')}
      uploadFileFn={uploadSharedLearningScenarioFile}
      isSpeechModelEnabled={isSpeechModelEnabled}
      generateSpeechFn={generateSharedLearningScenarioSpeech}
    />
  );
}
