'use client';

import { MagicWandIcon } from '@phosphor-icons/react';
import { FileModel } from '@shared/db/schema';
import { ConversationMessageModel } from '@shared/db/types';
import { logError } from '@shared/logging';
import { Button } from '@ui/components/button';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import React, { useEffect, useRef, useState } from 'react';

import aiBadge from '@/assets/ai-badge.png';
import { useImageAssistant } from '@/components/providers/image-assistant-provider';
import { IMAGE_GENERATION_INPUT_LIMIT } from '@/configuration-text-inputs/const';
import { bakeAiBadge } from '@/utils/images/bake-ai-badge';

import { ImageAttachment } from '../chat/message-image-attachment';
import { defaultUploadFile, LocalFileState } from '../file-upload/upload-file';
import { useImageModels } from '../providers/image-model-provider';
import { useImageStyle } from '../providers/image-style-provider';
import { ImageActionButtons } from './image-action-buttons';
import { useImageAspectRatio } from './image-aspect-ratio-provider';
import { ImageAssistant } from './image-assistant';
import { ImageEditAssistant } from './image-edit-assistant';
import { ImageGenerationError } from './image-generation-error';
import { ImageGenerationInputBox } from './image-generation-input-box';
import { ImageGenerationResult } from './image-generation-result';
import { ImageGenerationWarning } from './image-generation-warning';
import { ImageVersionSelect } from './image-version-select';
import LoadingAnimation from './loading-animation';
import { useImageGeneration } from './use-image-generation';
import { useImageVersions } from './use-image-versions';

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

  const { versions, selectedIndex, selectedVersion, setSelectedIndex, appendVersion } =
    useImageVersions({ initialMessages, fileMapping });

  const {
    isOpen: assistantOpen,
    setIsOpen: setAssistantOpen,
    isEnabled: isAssistantEnabled,
  } = useImageAssistant();
  const [editAssistantOpen, setEditAssistantOpen] = useState(false);

  const [input, setInput] = useState('');
  const [files, setFiles] = useState<Map<string, LocalFileState>>(new Map());
  const imageRef = useRef<HTMLImageElement>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [showAiBadge, setShowAiBadge] = useState(true);
  const [bakedEntry, setBakedEntry] = useState<{
    sourceUrl: string;
    objectUrl: string;
  } | null>(null);

  const sourceUrl = selectedVersion?.imageUrl ?? null;

  useEffect(() => {
    if (!showAiBadge || sourceUrl === null) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await bakeAiBadge(sourceUrl, aiBadge.src);
        if (cancelled) return;
        setBakedEntry({ sourceUrl, objectUrl: URL.createObjectURL(blob) });
      } catch (error) {
        if (!cancelled) logError('Failed to bake AI badge into image', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAiBadge, sourceUrl]);

  useEffect(() => {
    if (bakedEntry === null) return;
    return () => URL.revokeObjectURL(bakedEntry.objectUrl);
  }, [bakedEntry]);

  const displaySrc =
    showAiBadge && bakedEntry !== null && bakedEntry.sourceUrl === sourceUrl
      ? bakedEntry.objectUrl
      : (sourceUrl ?? '');

  // The displayed image's src can change after it has already loaded (e.g. once
  // the baked-AI-badge version becomes available), which resets img.complete.
  // Track readiness per src so copy/download aren't clickable against a stale image.
  const isImageReady = loadedSrc !== null && loadedSrc === displaySrc;

  const { aspectRatio } = useImageAspectRatio();

  const [pending, setPending] = useState<{
    prompt: string;
    attachedFiles: ImageAttachment[];
  } | null>(null);

  const { isGenerating, errorMessage, clearError, generate } = useImageGeneration({
    initialConversationId: conversationId,
    selectedModel,
    selectedStyle,
    aspectRatio,
  });

  const modelSupportsImageInput = (selectedModel?.supportedImageFormats?.length ?? 0) > 0;

  const canAppendVersion = modelSupportsImageInput && selectedVersion !== null;
  const maxFiles = canAppendVersion
    ? IMAGE_GENERATION_INPUT_LIMIT - 1
    : IMAGE_GENERATION_INPUT_LIMIT;

  const showInputBox =
    modelSupportsImageInput || (conversationId === undefined && selectedVersion === null);

  const showInputBoxBelowImage =
    showInputBox && modelSupportsImageInput && selectedVersion !== null;

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

  async function submitPrompt(rawPrompt: string) {
    if (!rawPrompt.trim() || !selectedModel || isGenerating) {
      return;
    }

    const prompt = rawPrompt.trim();
    setInput('');
    setFiles(new Map());

    const inputImageFileId =
      canAppendVersion && selectedVersion !== null ? selectedVersion.imageFileId : null;

    const processedFiles = modelSupportsImageInput
      ? Array.from(files.values()).filter(
          (f): f is LocalFileState & { fileId: string } =>
            f.status === 'processed' && f.fileId !== undefined,
        )
      : [];
    const uploadedFileIds = processedFiles.map((f) => f.fileId);
    const inputFileIds =
      inputImageFileId !== null && !uploadedFileIds.includes(inputImageFileId)
        ? [inputImageFileId, ...uploadedFileIds]
        : uploadedFileIds;

    const uploadedFileModels = processedFiles.map((f) => ({
      id: f.fileId,
      name: f.file.name,
    }));
    const inputImageFileModel =
      inputImageFileId !== null
        ? { id: inputImageFileId, name: tImageGeneration('generated-image-alt') }
        : null;
    const attachedFiles =
      inputImageFileModel !== null
        ? [inputImageFileModel, ...uploadedFileModels]
        : uploadedFileModels;

    setPending({ prompt, attachedFiles });

    const generatedImage = await generate({ prompt, inputFileIds });
    if (generatedImage !== null) {
      appendVersion({ ...generatedImage, attachedFiles });
    }
  }

  async function customHandleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitPrompt(input);
  }

  const inputBox = (
    <>
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
        maxFiles={maxFiles}
        isEditMode={showInputBoxBelowImage}
      />
      {files.size > 0 && !modelSupportsImageInput && (
        <ImageGenerationWarning message={tImageGeneration('input-images-not-supported-warning')} />
      )}
      {isAssistantEnabled && (
        <div className="flex justify-end mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAssistantOpen(true)}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <MagicWandIcon className="size-4" weight="duotone" />
            {tImageGeneration('assistant-hint-button')}
          </Button>
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col h-full w-full">
      {isAssistantEnabled && (
        <>
          <ImageAssistant
            open={assistantOpen}
            onOpenChange={setAssistantOpen}
            onPromptGenerated={(prompt) => setInput(prompt)}
            onSubmitPrompt={(prompt) => void submitPrompt(prompt)}
            onInsertPrompt={(prompt) => setInput(prompt)}
            initialPrompt={input}
          />
          <ImageEditAssistant
            open={editAssistantOpen}
            onOpenChange={setEditAssistantOpen}
            onPromptGenerated={(prompt) => setInput(prompt)}
            originalPrompt={selectedVersion?.prompt ?? ''}
            imageUrl={selectedVersion?.imageUrl}
          />
        </>
      )}
      <div className="flex-1 flex flex-col justify-start p-6 w-full mx-auto">
        {versions.length > 1 && (
          <div className="mb-3 w-3/4 mx-auto">
            <ImageVersionSelect
              count={versions.length}
              selectedIndex={selectedIndex}
              onChange={(index) => {
                clearError();
                setSelectedIndex(index);
              }}
              disabled={isGenerating}
            />
          </div>
        )}
        {showInputBox && !showInputBoxBelowImage && inputBox}
        <div className="w-3/4 mx-auto mt-6 first:mt-0">
          {isGenerating && pending !== null && (
            <ImageGenerationResult prompt={pending.prompt} attachedFiles={pending.attachedFiles}>
              <LoadingAnimation />
            </ImageGenerationResult>
          )}

          {errorMessage && !isGenerating && pending !== null && (
            <ImageGenerationResult prompt={pending.prompt} attachedFiles={pending.attachedFiles}>
              <ImageGenerationError message={errorMessage} />
            </ImageGenerationResult>
          )}

          {selectedVersion !== null && !isGenerating && !errorMessage && (
            <ImageGenerationResult
              prompt={selectedVersion.prompt}
              attachedFiles={selectedVersion.attachedFiles}
            >
              <Image
                ref={imageRef}
                src={displaySrc}
                alt={selectedVersion.prompt}
                data-testid="generated-image"
                className="w-full rounded-xl"
                width={800}
                height={800}
                loading="eager"
                unoptimized
                crossOrigin="anonymous" // Needed for clipboard copy to work
                onLoad={() => setLoadedSrc(displaySrc)}
              />
              <ImageActionButtons
                imageRef={imageRef}
                fileId={selectedVersion.imageFileId}
                isImageReady={isImageReady}
                showAiBadge={showAiBadge}
                onShowAiBadgeChange={setShowAiBadge}
              />
              {isAssistantEnabled && showInputBox && (
                <div className="flex justify-end mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditAssistantOpen(true)}
                    className="gap-1.5 shrink-0"
                  >
                    <MagicWandIcon className="size-4" weight="duotone" />
                    {tImageGeneration('edit-assistant-button')}
                  </Button>
                </div>
              )}
            </ImageGenerationResult>
          )}
          {showInputBoxBelowImage && <div className="mt-6">{inputBox}</div>}
        </div>
      </div>
    </div>
  );
}
