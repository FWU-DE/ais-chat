import { NUMBER_OF_FILES_LIMIT } from '@/configuration-text-inputs/const';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '../common/toast';
import {
  filterValidFilesForUpload,
  getAllowedFileExtensions,
  getFilesFromClipboard,
  handleSingleFile,
  type FileUploadResponse,
  type LocalFileState,
} from './upload-file';
import { useLlmModels } from '../providers/llm-model-provider';

export function useFileUpload({
  files,
  setFiles,
  fileUploadFn,
}: {
  files?: Map<string, LocalFileState>;
  setFiles?: Dispatch<SetStateAction<Map<string, LocalFileState>>>;
  fileUploadFn?: (file: File) => Promise<FileUploadResponse>;
}) {
  const toast = useToast();
  const translations = useTranslations('file-interaction');
  const { selectedModel } = useLlmModels();
  const currentFiles = files ?? new Map<string, LocalFileState>();
  const allowedFileExtensions = getAllowedFileExtensions(
    currentFiles.values(),
    selectedModel?.supportedImageFormats,
  );
  const hasUploadingFiles = Array.from(currentFiles.values()).some(
    (file) => file.status === 'uploading',
  );

  async function uploadFiles(selectedFiles: File[]) {
    if (setFiles === undefined || selectedFiles.length === 0) return;

    const availableSlots = NUMBER_OF_FILES_LIMIT - currentFiles.size;
    if (availableSlots <= 0) {
      toast.error(
        translations('upload.file-limit-reached', {
          max_files: NUMBER_OF_FILES_LIMIT,
          files_exceeded: selectedFiles.length,
        }),
      );
      return;
    }

    const validFiles = filterValidFilesForUpload(selectedFiles, {
      allowedFileExtensions,
      toast,
      translations,
    });
    const filesToUpload = validFiles.slice(0, availableSlots);
    const filesExceeded = validFiles.length - filesToUpload.length;
    if (filesExceeded > 0) {
      toast.error(
        translations('upload.file-limit-reached', {
          max_files: NUMBER_OF_FILES_LIMIT,
          files_exceeded: filesExceeded,
        }),
      );
    }

    await Promise.all(
      filesToUpload.map((file) =>
        handleSingleFile({
          file,
          setFiles,
          fileUploadFn,
          toast,
          translations,
          allowedFileExtensions,
        }),
      ),
    );
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const clipboardFiles = getFilesFromClipboard(event.clipboardData);
    if (clipboardFiles.length === 0 || !setFiles || !files) return;

    event.preventDefault();
    await uploadFiles(clipboardFiles);
  }

  return {
    allowedFileExtensions,
    hasUploadingFiles,
    handlePaste,
    uploadFiles,
  };
}
