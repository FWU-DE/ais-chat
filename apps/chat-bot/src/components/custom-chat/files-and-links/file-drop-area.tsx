import { NUMBER_OF_FILES_LIMIT_FOR_SHARED_CHAT } from '@/configuration-text-inputs/const';
import { SUPPORTED_DOCUMENTS_EXTENSIONS } from '@/const';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React, { useCallback, useRef, useState } from 'react';
import { RichText } from '../../common/rich-text';
import { useToast } from '../../common/toast';
import { handleSingleFile, type FileUploadProps } from '../../file-upload/upload-file';
import { FileUploadIcon } from '../../icons/file-upload-icons/file-upload-tray-icon';

export function FileDrop({
  onFileUploaded,
  setFiles,
  disabled,
  showUploadConfirmation = false,
  countOfFiles,
  ...restProps
}: FileUploadProps & { countOfFiles?: number; disabled?: boolean }) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const t = useTranslations('file-interaction');

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    await handleFiles(event.target.files);
  }

  async function handleFiles(selectedFiles: FileList | undefined | null) {
    if (selectedFiles === null || selectedFiles === undefined) return;
    const files = Array.from(selectedFiles);

    const totalFileCount = countOfFiles ? countOfFiles + files.length : files.length;

    if (totalFileCount > NUMBER_OF_FILES_LIMIT_FOR_SHARED_CHAT) {
      toast.error(
        t('toasts.file-limit-exceeded', {
          max_files: NUMBER_OF_FILES_LIMIT_FOR_SHARED_CHAT,
        }),
      );
      return;
    }

    await Promise.all(
      files.map((f) =>
        handleSingleFile({
          file: f,
          toast,
          setFiles,
          onFileUploaded,
          translations: t,
          showUploadConfirmation,
          allowedFileExtensions: SUPPORTED_DOCUMENTS_EXTENSIONS,
        }),
      ),
    );

    if (fileInputRef.current !== null) {
      fileInputRef.current.value = '';
    }
  }

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragging) {
        setIsDragging(true);
      }
    },
    [isDragging],
  );

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const { files } = e.dataTransfer;
    void handleFiles(files);
  }

  const handleButtonClick = (): void => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div {...restProps}>
      <div
        className={`border-2 border-dashed rounded-enterprise-sm p-6 text-center transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-600'
        }`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label="File Drop Area"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept={SUPPORTED_DOCUMENTS_EXTENSIONS.map((e) => `.${e}`).join(', ')}
          multiple
          aria-label={t('upload.upload-input-aria-label')}
        />
        <div className="flex flex-col text-sm gap-4 items-center">
          <span className="text-base">
            <RichText>
              {(tags) =>
                t.rich('upload.drop-area', {
                  ...tags,
                  supported_formats: SUPPORTED_DOCUMENTS_EXTENSIONS.join(', '),
                })
              }
            </RichText>
          </span>
          <span className="text-gray-600">{t('upload.choice-word')}</span>
          <Button disabled={disabled} onClick={handleButtonClick} type="button">
            <FileUploadIcon className="size-4" />
            {t('upload.upload-file-button')}
          </Button>
        </div>
      </div>
    </div>
  );
}
