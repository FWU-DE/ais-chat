'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useImageModels } from '../providers/image-model-provider';
import { useImageStyle } from '../providers/image-style-provider';
import { generateImageAction } from '@/app/(authed)/(chat-bot)/image-generation/actions';
import { ImageGenerationInputBox } from './image-generation-input-box';
import { ImageActionButtons } from './image-action-buttons';
import { ImageGenerationError } from './image-generation-error';
import { ImageGenerationWarning } from './image-generation-warning';
import { useTranslations } from 'next-intl';
import LoadingAnimation from './loading-animation';
import { ConversationMessageModel } from '@shared/db/types';
import { getReadOnlySignedUrlAction } from '@/app/api/file-operations/actions';
import { FileModel } from '@shared/db/schema';
import { useQueryClient } from '@tanstack/react-query';
import { logError } from '@shared/logging';
import { ResponsibleAIError } from '@ais-chat/ai-core/errors';
import Image from 'next/image';
import { navigateWithoutRefresh } from '@/utils/navigation/router';
import { useImageAspectRatio } from './image-aspect-ratio-provider';
import { LocalFileState } from '../chat/send-message-form';
import { defaultUploadFile } from '../chat/upload-file-button';
import { isImageFile } from '@/utils/files/generic';
import { ImageGenerationResult } from './image-generation-result';

interface ImageGenerationChatProps {
  conversationId?: string;
  initialMessages?: ConversationMessageModel[];
  fileMapping?: Map<string, FileModel[]>;
}

export default function ImageGenerationChat({
  conversationId,
  initialMessages = [],
  fileMapping,
}: ImageGenerationChatProps) {
  const { selectedModel } = useImageModels();
  const { selectedStyle } = useImageStyle();
  const tImageGeneration = useTranslations('image-generation');

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const [displayedImage, setDisplayedImage] = useState<{
    prompt: string;
    imageUrl: string;
    fileId: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [files, setFiles] = useState<Map<string, LocalFileState>>(new Map());
  const [submittedInputFiles, setSubmittedInputFiles] = useState<FileModel[]>([]);
  const queryClient = useQueryClient();
  const imageRef = useRef<HTMLImageElement>(null);
  // isImageReady indicates if the image is loaded and visible in the browser
  const [isImageReady, setIsImageReady] = useState(false);

  const { aspectRatio } = useImageAspectRatio();

  const modelSupportsImageInput = (selectedModel?.supportedImageFormats?.length ?? 0) > 0;

  // Load the single image from initial messages and file attachments
  useEffect(() => {
    const loadImageFromFiles = async () => {
      if (initialMessages.length >= 2 && fileMapping) {
        const userMessage = initialMessages.find((msg) => msg.role === 'user');
        const assistantMessage = initialMessages.find((msg) => msg.role === 'assistant');

        if (userMessage && assistantMessage) {
          const userInputImages = (fileMapping.get(userMessage.id) ?? []).filter((file) =>
            isImageFile(file.name),
          );
          setSubmittedInputFiles(userInputImages);

          // Get files attached to the assistant message
          const attachedFiles = fileMapping.get(assistantMessage.id) || [];
          const imageFile = attachedFiles.find((file) => file.type.startsWith('image/'));

          if (imageFile) {
            try {
              // Generate signed URL for the image file
              const signedUrl = await getReadOnlySignedUrlAction({
                key: `message_attachments/${imageFile.id}`,
                contentType: imageFile.type,
                attachment: false,
              });

              if (signedUrl) {
                setDisplayedImage({
                  prompt: userMessage.content,
                  imageUrl: signedUrl,
                  fileId: imageFile.id,
                });
              }
            } catch (error) {
              logError('Error loading image from files:', error);
            }
          }
        }
      }
    };

    loadImageFromFiles();
  }, [initialMessages, fileMapping]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
  }

  function handleDeattachFile(localFileId: string) {
    setFiles((prev) => {
      const next = new Map(prev);
      next.delete(localFileId);
      return next;
    });
  }

  function refetchConversations() {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }

  async function customHandleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!input.trim() || !selectedModel || isGenerating) {
      return;
    }

    const currentPrompt = input.trim();
    setLastPrompt(currentPrompt);
    setErrorMessage(null);

    const processedFiles = modelSupportsImageInput
      ? Array.from(files.values()).filter(
          (f): f is LocalFileState & { fileId: string } =>
            f.status === 'processed' && f.fileId !== undefined,
        )
      : [];
    const inputFileIds = processedFiles.map((f) => f.fileId);

    setSubmittedInputFiles(
      processedFiles.map((f) => ({
        id: f.fileId,
        name: f.file.name,
        type: f.file.type,
        size: f.file.size,
        createdAt: new Date(),
        metadata: null,
        userId: null,
      })),
    );
    setIsGenerating(true);
    setInput('');
    setFiles(new Map());

    const result = await generateImageAction({
      prompt: currentPrompt,
      model: selectedModel,
      style: selectedStyle,
      options: { aspectRatio },
      inputFileIds,
    });
    if (result.success) {
      // Update the displayed image
      if (result.value.imageUrl) {
        setIsImageReady(false);
        setDisplayedImage({
          prompt: currentPrompt,
          imageUrl: result.value.imageUrl,
          fileId: result.value.fileId,
        });
      }

      const newConversationId = result.value.conversationId;
      if (conversationId === undefined || conversationId !== newConversationId) {
        navigateWithoutRefresh(`/image-generation/d/${newConversationId}`);
      }
      refetchConversations();
    } else {
      const error = result.error;
      if (ResponsibleAIError.is(error)) {
        setErrorMessage(tImageGeneration('responsible-ai-error'));
      } else {
        setErrorMessage(tImageGeneration('generation-error'));
      }
    }
    setIsGenerating(false);
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 flex flex-col justify-start p-6 w-full mx-auto">
        <ImageGenerationInputBox
          isLoading={isGenerating}
          handleInputChange={handleInputChange}
          customHandleSubmit={customHandleSubmit}
          input={input}
          files={files}
          setFiles={setFiles}
          handleDeattachFile={handleDeattachFile}
          fileUploadFn={defaultUploadFile}
          supportedImageFormats={selectedModel?.supportedImageFormats}
        />
        {files.size > 0 && !modelSupportsImageInput && (
          <ImageGenerationWarning
            message={tImageGeneration('input-images-not-supported-warning')}
          />
        )}
        <div className="w-3/4 mx-auto">
          {isGenerating && (
            <ImageGenerationResult prompt={lastPrompt} attachedFiles={submittedInputFiles}>
              <LoadingAnimation />
            </ImageGenerationResult>
          )}

          {errorMessage && !isGenerating && (
            <ImageGenerationResult prompt={lastPrompt} attachedFiles={submittedInputFiles}>
              <ImageGenerationError message={errorMessage} />
            </ImageGenerationResult>
          )}

          {displayedImage && !isGenerating && !errorMessage && (
            <ImageGenerationResult
              prompt={displayedImage.prompt}
              attachedFiles={submittedInputFiles}
            >
              <Image
                ref={imageRef}
                src={displayedImage.imageUrl}
                alt={displayedImage.prompt}
                data-testid="generated-image"
                className="w-full rounded-xl"
                width={800}
                height={800}
                loading="eager"
                unoptimized
                crossOrigin="anonymous" // Needed for clipboard copy to work
                onLoad={() => setIsImageReady(true)}
              />
              <ImageActionButtons
                imageRef={imageRef}
                fileId={displayedImage.fileId}
                isImageReady={isImageReady}
              />
            </ImageGenerationResult>
          )}
        </div>
      </div>
    </div>
  );
}
