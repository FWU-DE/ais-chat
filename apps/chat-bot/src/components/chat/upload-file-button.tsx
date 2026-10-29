import { NUMBER_OF_FILES_LIMIT } from '@/configuration-text-inputs/const';
import { cn } from '@/utils/tailwind';
import { useTranslations } from 'next-intl';
import React from 'react';
import type { LocalFileState } from '../file-upload/upload-file';
import AttachFileIcon from '../icons/attach-file';

export type { FileUploadResponse } from '../file-upload/upload-file';

export type UploadFileButtonProps = {
  triggerButton?: React.ReactNode;
  onFileUploadStart?: () => void;
  className?: string;
  directoryId?: string;
  countOfFiles?: number;
  files?: Map<string, LocalFileState>;
  allowedFileExtensions: readonly string[];
  onFilesSelected: (files: File[]) => Promise<void>;
  disabled?: boolean;
};

export default function UploadFileButton({
  className,
  files,
  allowedFileExtensions,
  onFilesSelected,
}: UploadFileButtonProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const t = useTranslations('file-interaction');

  const totalNumberOfFiles = Array.from(files?.values() ?? []).length;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = event.target.files;

    if (selectedFiles === null) return;

    const files = Array.from(selectedFiles);
    await onFilesSelected(files);
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
        accept={allowedFileExtensions.map((extension) => `.${extension}`).join(',')}
      />
      <button
        onClick={handleUploadClick}
        className={cn(className, 'disabled:cursor-not-allowed')}
        disabled={isUploadLimitReached}
        type="button"
        aria-label={t('upload.upload-input-aria-label')}
        title={
          isUploadLimitReached
            ? t('upload.upload-file-button-disabled', { max_files: NUMBER_OF_FILES_LIMIT })
            : t('upload.upload-file-button')
        }
      >
        <AttachFileIcon
          className={cn('sm:w-10 sm:h-10 w-8 h-8')}
          stroke="black"
          aria-hidden="true"
        />
      </button>
    </>
  );
}
