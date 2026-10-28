import { NUMBER_OF_FILES_LIMIT, NUMBER_OF_IMAGES_LIMIT } from '@/configuration-text-inputs/const';
import { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';
import { useToast } from '../common/toast';
import { useLlmModels } from '../providers/llm-model-provider';
import {
  filterFilesByImageLimit,
  filterValidFilesForUpload,
  getAllowedFileExtensions,
  handleSingleFile,
  type FileUploadResponse,
  type LocalFileState,
} from './upload-file';

export function useFileUpload({
  files,
  setFiles,
  fileUploadFn,
  maxFiles = NUMBER_OF_FILES_LIMIT,
  allowedFileExtensions: configuredFileExtensions,
  imageLimit = NUMBER_OF_IMAGES_LIMIT,
}: {
  files?: Map<string, LocalFileState>;
  setFiles?: Dispatch<SetStateAction<Map<string, LocalFileState>>>;
  fileUploadFn?: (file: File) => Promise<FileUploadResponse>;
  maxFiles?: number;
  allowedFileExtensions?: readonly string[];
  imageLimit?: number;
}) {
  const toast = useToast();
  const translations = useTranslations('file-interaction');
  const { selectedModel } = useLlmModels();
  const currentFiles = files ?? new Map<string, LocalFileState>();
  const allowedFileExtensions =
    configuredFileExtensions ??
    getAllowedFileExtensions(currentFiles.values(), selectedModel?.supportedImageFormats);
  const hasUploadingFiles = Array.from(currentFiles.values()).some(
    (file) => file.status === 'uploading',
  );

  async function uploadFiles(selectedFiles: File[]) {
    if (setFiles === undefined || selectedFiles.length === 0) return;

    const availableSlots = maxFiles - currentFiles.size;
    if (availableSlots <= 0) {
      toast.error(
        translations('upload.file-limit-reached', {
          max_files: maxFiles,
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
    const { files: filesWithinImageLimit, imagesExceeded } = filterFilesByImageLimit(
      validFiles,
      currentFiles.values(),
      imageLimit,
    );

    const filesToUpload = filesWithinImageLimit.slice(0, availableSlots);
    const filesExceeded = filesWithinImageLimit.length - filesToUpload.length;
    if (imagesExceeded > 0) {
      toast.error(
        translations('upload.image-limit-reached', {
          max_images: imageLimit,
          images_exceeded: imagesExceeded,
        }),
      );
    }
    if (filesExceeded > 0) {
      toast.error(
        translations('upload.file-limit-reached', {
          max_files: maxFiles,
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
    const clipboardFiles = Array.from(event.clipboardData.files);
    if (clipboardFiles.length === 0 || !setFiles || !files) return;

    if (event.clipboardData.getData('text/plain').length === 0) {
      event.preventDefault();
    }
    await uploadFiles(clipboardFiles);
  }

  return {
    allowedFileExtensions,
    hasUploadingFiles,
    handlePaste,
    uploadFiles,
  };
}
