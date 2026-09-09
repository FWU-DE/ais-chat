'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { LlmModelSelectModel } from '@shared/db/schema';
import { ImageStyle } from '@shared/utils/chat';
import { generateImageAction } from '@/app/(authed)/(chat-bot)/image-generation/actions';
import { navigateWithoutRefresh } from '@/utils/navigation/router';
import { ImageAspectRatioPreset } from './image-generation-types';
import { getErrorMessageByType } from '@/error/get-error-message-by-type';

interface UseImageGenerationArgs {
  initialConversationId?: string;
  selectedModel: LlmModelSelectModel | undefined;
  selectedStyle: ImageStyle | undefined;
  aspectRatio: ImageAspectRatioPreset;
}

export interface GeneratedImage {
  userMessageId: string;
  assistantMessageId: string;
  prompt: string;
  imageUrl: string;
  imageFileId: string;
}

interface UseImageGenerationResult {
  isGenerating: boolean;
  errorMessage: string | null;
  clearError: () => void;
  generate: (params: { prompt: string; inputFileIds: string[] }) => Promise<GeneratedImage | null>;
}

export function useImageGeneration({
  initialConversationId,
  selectedModel,
  selectedStyle,
  aspectRatio,
}: UseImageGenerationArgs): UseImageGenerationResult {
  const t = useTranslations('image-generation');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(
    initialConversationId,
  );

  async function generate({
    prompt,
    inputFileIds,
  }: {
    prompt: string;
    inputFileIds: string[];
  }): Promise<GeneratedImage | null> {
    if (!selectedModel) return null;

    const normalizedPrompt = prompt.trim();
    setErrorMessage(null);
    setIsGenerating(true);

    let generatedImage: GeneratedImage | null = null;

    try {
      const result = await generateImageAction({
        prompt: normalizedPrompt,
        model: selectedModel,
        style: selectedStyle,
        options: { aspectRatio },
        inputFileIds,
        conversationId: currentConversationId,
      });

      if (result.success) {
        const newConversationId = result.value.conversationId;
        if (currentConversationId !== newConversationId) {
          setCurrentConversationId(newConversationId);
          navigateWithoutRefresh(`/image-generation/d/${newConversationId}`);
        }
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });

        if (result.value.imageUrl) {
          generatedImage = {
            userMessageId: result.value.userMessageId,
            assistantMessageId: result.value.assistantMessageId,
            prompt: normalizedPrompt,
            imageUrl: result.value.imageUrl,
            imageFileId: result.value.fileId,
          };
        }
      } else {
        const messageKey = getErrorMessageByType(result.error);
        setErrorMessage(
          messageKey === 'generic-error' ? t('generation-error') : tCommon(messageKey),
        );
      }
    } catch {
      setErrorMessage(t('generation-error'));
    } finally {
      setIsGenerating(false);
    }

    return generatedImage;
  }

  return {
    isGenerating,
    errorMessage,
    clearError: () => setErrorMessage(null),
    generate,
  };
}
