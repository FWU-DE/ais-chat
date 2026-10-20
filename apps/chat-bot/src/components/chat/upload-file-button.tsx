import { NUMBER_OF_FILES_LIMIT, NUMBER_OF_IMAGES_LIMIT } from '@/configuration-text-inputs/const';
import { MAX_FILE_SIZE, SUPPORTED_DOCUMENTS_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS } from '@/const';
import { isImageFile } from '@/utils/files/generic';
import { cn } from '@/utils/tailwind';
import { logError } from '@shared/logging';
import { nanoid } from 'nanoid';
import { useTranslations } from 'next-intl';
import React from 'react';
import { z } from 'zod';
import { ToastContextType, useToast } from '../common/toast';
import AttachFileIcon from '../icons/attach-file';
import { useLlmModels } from '../providers/llm-model-provider';
import { LocalFileState } from './send-message-form';

export type FileUploadMetadata = {
  directoryId: string;
};

export type FileUploadResponse = {
  fileId: string;
};

export type FileStatus = 'uploading' | 'processed' | 'failed' | 'success';

export type UploadFileButtonProps = {
  setFiles: React.Dispatch<React.SetStateAction<Map<string, LocalFileState>>>;
  onFileUploaded?: (data: { id: string; name: string; file: File }) => void | Promise<void>;
  triggerButton?: React.ReactNode;
  fileUploadFn?: (file: File) => Promise<FileUploadResponse>;
  onFileUploadStart?: () => void;
  className?: string;
  directoryId?: string;
  showUploadConfirmation?: boolean;
  countOfFiles?: number;
  setFileUploading?: React.Dispatch<React.SetStateAction<boolean>>;
  files?: Map<string, LocalFileState>;
  disabled?: boolean;
};

export async function handleSingleFile({
  file,
  setFiles,
  onFileUploaded,
  fileUploadFn,
  toast,
  translations,
  showUploadConfirmation,
}: {
  file: File;
  setFiles: React.Dispatch<React.SetStateAction<Map<string, LocalFileState>>>;
  onFileUploaded?: (data: { id: string; name: string; file: File }) => void | Promise<void>;
  fileUploadFn?: (file: File) => Promise<FileUploadResponse>;
  toast: ToastContextType;
  translations: ReturnType<typeof useTranslations>;
  showUploadConfirmation?: boolean;
}) {
  if (!file) {
    throw new Error('No files uploaded');
  }
  if (file.size > MAX_FILE_SIZE) {
    toast.error(
      translations('toasts.file-too-large', {
        file_name: file.name,
        max_file_size: MAX_FILE_SIZE / 1_000_000,
      }),
    );
    return;
  }
  const localId = nanoid();
  setFiles((prevFiles) => {
    const updatedFiles = new Map(prevFiles);
    updatedFiles.set(localId, {
      file,
      status: 'uploading',
      fileId: undefined,
    });
    return updatedFiles;
  });

  const blobFile = new Blob([file], { type: file.type });

  try {
    const uploadFn = fileUploadFn ?? defaultUploadFile;
    const response = await uploadFn(new File([blobFile], file.name, { type: file.type }));

    const fileId = response.fileId;

    if (!fileId) {
      throw new Error('Upload response did not include fileId');
    }

    setFiles((prevFiles) => {
      const updatedFiles = new Map(prevFiles);
      const fileState = updatedFiles.get(localId);
      if (fileState) {
        updatedFiles.set(localId, {
          ...fileState,
          status: 'processed',
          fileId,
        });
      }
      return updatedFiles;
    });
    await onFileUploaded?.({ id: fileId, name: file.name, file });
    if (showUploadConfirmation) toast.success(translations('toasts.upload-success'));
  } catch (error) {
    setFiles((prevFiles) => {
      const updatedFiles = new Map(prevFiles);
      const fileState = updatedFiles.get(localId);
      if (fileState) {
        updatedFiles.set(localId, {
          ...fileState,
          status: 'failed',
        });
      }
      logError('File upload error', error);
      toast.error(translations('toasts.upload-error'));
      return updatedFiles;
    });
  }
}

export async function defaultUploadFile(file: File): Promise<FileUploadResponse> {
  const blobFile = new Blob([file], { type: file.type });

  return fetchUploadFile({
    body: blobFile,
    contentType: file.type,
    fileName: file.name,
  });
}

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
        }),
      ),
    );
    setFileUploading?.(false);
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = '';
    }
  }
  const currentSupportedFileFormats = [...SUPPORTED_DOCUMENTS_EXTENSIONS, ...allowedImageFormats];
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
        aria-label="Datei hochladen"
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

async function fetchUploadFile(data: {
  body: Blob;
  contentType: string;
  fileName: string;
}): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append('file', data.body, data.fileName);
  const response = await fetch('/api/v1/files', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error('Could not upload file');
  }

  const json = await response.json();
  const parsedJson = z.object({ file_id: z.string() }).parse(JSON.parse(json?.body));

  return {
    fileId: parsedJson.file_id,
  };
}
