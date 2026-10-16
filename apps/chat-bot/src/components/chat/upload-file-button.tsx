import { NUMBER_OF_FILES_LIMIT, NUMBER_OF_IMAGES_LIMIT } from '@/configuration-text-inputs/const';
import { SUPPORTED_DOCUMENTS_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS } from '@/const';
import { isImageFile } from '@/utils/files/generic';
import { cn } from '@/utils/tailwind';
import { useTranslations } from 'next-intl';
import React from 'react';
import { useToast } from '../common/toast';
import {
  handleSingleFile,
  type FileUploadProps,
  type LocalFileState,
} from '../file-upload/upload-file';
import AttachFileIcon from '../icons/attach-file';
import { useLlmModels } from '../providers/llm-model-provider';

export type { FileUploadResponse } from '../file-upload/upload-file';

export type UploadFileButtonProps = FileUploadProps & {
  triggerButton?: React.ReactNode;
  onFileUploadStart?: () => void;
  className?: string;
  directoryId?: string;
  countOfFiles?: number;
  setFileUploading?: React.Dispatch<React.SetStateAction<boolean>>;
  files?: Map<string, LocalFileState>;
  disabled?: boolean;
};

export default function UploadFileButton({
  setFiles,
  className,
  setFileUploading,
  files,
  fileUploadFn,
}: UploadFileButtonProps) {
  const toast = useToast();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const t = useTranslations('file-interaction');
  const { selectedModel } = useLlmModels();

  const numberOfImages = Array.from(files?.values() ?? []).filter(
    (file) => file.status === 'processed' && isImageFile(file.file.name),
  ).length;
  const totalNumberOfFiles = Array.from(files?.values() ?? []).length;
  const allowedImageFormats =
    numberOfImages < NUMBER_OF_IMAGES_LIMIT && selectedModel?.supportedImageFormats?.length !== 0
      ? SUPPORTED_IMAGE_EXTENSIONS
      : [];
  const currentSupportedFileFormats = [...SUPPORTED_DOCUMENTS_EXTENSIONS, ...allowedImageFormats];

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = event.target.files;

    if (selectedFiles === null) return;

    const files = Array.from(selectedFiles);
    setFileUploading?.(true);
    await Promise.all(
      files.map((f) =>
        handleSingleFile({
          file: f,
          setFiles,
          fileUploadFn,
          toast,
          translations: t,
          allowedFileExtensions: currentSupportedFileFormats,
        }),
      ),
    );
    setFileUploading?.(false);
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = '';
    }
  }
  const isUploadLimitReached = totalNumberOfFiles >= NUMBER_OF_FILES_LIMIT;

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  return (
    <>
      <input
        hidden
        multiple
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={currentSupportedFileFormats.map((e) => `.${e}`).join(',')}
      />
      <button
        onClick={handleUploadClick}
        className={cn(className, 'disabled:cursor-not-allowed')}
        disabled={isUploadLimitReached}
        type="button"
        title={
          isUploadLimitReached
            ? t('upload.upload-file-button-disabled', { max_files: NUMBER_OF_FILES_LIMIT })
            : t('upload.upload-file-button')
        }
      >
        <AttachFileIcon className={cn('sm:w-10 sm:h-10 w-8 h-8')} stroke="black" />
      </button>
    </>
  );
}
