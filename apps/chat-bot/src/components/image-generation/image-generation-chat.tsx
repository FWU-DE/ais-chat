'use client';

import React, { useRef, useState } from 'react';
import { useImageModels } from '../providers/image-model-provider';
import { useImageStyle } from '../providers/image-style-provider';
import { ImageGenerationInputBox } from './image-generation-input-box';
import { ImageActionButtons } from './image-action-buttons';
import { ImageGenerationError } from './image-generation-error';
import { ImageGenerationWarning } from './image-generation-warning';
import { useTranslations } from 'next-intl';
import LoadingAnimation from './loading-animation';
import { ConversationMessageModel } from '@shared/db/types';
import { FileModel } from '@shared/db/schema';
import Image from 'next/image';
import { useImageAspectRatio } from './image-aspect-ratio-provider';
import { LocalFileState } from '../chat/send-message-form';
import { defaultUploadFile } from '../chat/upload-file-button';
import { ImageGenerationResult } from './image-generation-result';
import { IMAGE_GENERATION_INPUT_LIMIT } from '@/configuration-text-inputs/const';
import { ImageVersionSelect } from './image-version-select';
import { useImageVersions } from './use-image-versions';
import { useImageGeneration } from './use-image-generation';
import { ImageAttachment } from '../chat/message-image-attachment';

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

  const [input, setInput] = useState('');
  const [files, setFiles] = useState<Map<string, LocalFileState>>(new Map());
  const imageRef = useRef<HTMLImageElement>(null);
  const [isImageReady, setIsImageReady] = useState(false);

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

  async function customHandleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!input.trim() || !selectedModel || isGenerating) {
      return;
    }

    const prompt = input.trim();
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
      setIsImageReady(false);
      appendVersion({ ...generatedImage, attachedFiles });
    }
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
    </>
  );

  return (
    <div className="flex flex-col h-full w-full">
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
                src={selectedVersion.imageUrl}
                alt={selectedVersion.prompt}
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
                fileId={selectedVersion.imageFileId}
                isImageReady={isImageReady}
              />
            </ImageGenerationResult>
          )}
          {showInputBoxBelowImage && <div className="mt-6">{inputBox}</div>}
        </div>
      </div>
    </div>
  );
}
