import { NUMBER_OF_IMAGES_LIMIT } from '@/configuration-text-inputs/const';
import { MAX_FILE_SIZE, SUPPORTED_DOCUMENTS_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS } from '@/const';
import { isImageFile, validateFileExtension } from '@/utils/files/generic';
import { logError } from '@shared/logging';
import { nanoid } from 'nanoid';
import { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';
import { z } from 'zod';
import type { ToastContextType } from '../common/toast';

export type FileUploadResponse = {
  fileId: string;
};

export type FileStatus = 'uploading' | 'processed' | 'success';

export type LocalFileState = {
  file: File;
  status: FileStatus;
  fileId: string | undefined;
};

export type FileUploadProps = {
  setFiles: Dispatch<SetStateAction<Map<string, LocalFileState>>>;
  onFileUploaded?: (data: { id: string; name: string; file: File }) => void | Promise<void>;
  fileUploadFn?: (file: File) => Promise<FileUploadResponse>;
  showUploadConfirmation?: boolean;
};

function countImageFiles(files: Iterable<LocalFileState>): number {
  return Array.from(files).filter((file) => isImageFile(file.file.name)).length;
}

export function getAllowedFileExtensions(
  files: Iterable<LocalFileState>,
  supportedImageFormats: string[] | null | undefined,
): readonly string[] {
  const numberOfImages = countImageFiles(files);
  const allowedImageFormats =
    numberOfImages < NUMBER_OF_IMAGES_LIMIT && supportedImageFormats?.length !== 0
      ? SUPPORTED_IMAGE_EXTENSIONS
      : [];

  return [...SUPPORTED_DOCUMENTS_EXTENSIONS, ...allowedImageFormats];
}

export function validateFileUpload({
  file,
  allowedFileExtensions,
  toast,
  translations,
}: {
  file: File;
  allowedFileExtensions: readonly string[];
  toast: ToastContextType;
  translations: ReturnType<typeof useTranslations>;
}): boolean {
  if (!validateFileExtension(file.name, allowedFileExtensions)) {
    toast.error(
      translations('toasts.invalid-file-format', {
        supported_formats: allowedFileExtensions.join(', '),
      }),
    );
    return false;
  }
  if (file.size > MAX_FILE_SIZE) {
    toast.error(
      translations('toasts.file-too-large', {
        file_name: file.name,
        max_file_size: MAX_FILE_SIZE / 1_000_000,
      }),
    );
    return false;
  }

  return true;
}

export function filterValidFilesForUpload(
  files: readonly File[],
  validation: Omit<Parameters<typeof validateFileUpload>[0], 'file'>,
): File[] {
  return files.filter((file) => validateFileUpload({ ...validation, file }));
}

export function filterFilesByImageLimit(
  files: readonly File[],
  existingFiles: Iterable<LocalFileState>,
): { files: File[]; imagesExceeded: number } {
  let remainingImageSlots = NUMBER_OF_IMAGES_LIMIT - countImageFiles(existingFiles);
  let imagesExceeded = 0;

  const filteredFiles = files.filter((file) => {
    if (!isImageFile(file.name)) return true;
    if (remainingImageSlots > 0) {
      remainingImageSlots -= 1;
      return true;
    }
    imagesExceeded += 1;
    return false;
  });

  return { files: filteredFiles, imagesExceeded };
}

export async function handleSingleFile({
  file,
  setFiles,
  onFileUploaded,
  fileUploadFn,
  toast,
  translations,
  showUploadConfirmation,
  allowedFileExtensions = [...SUPPORTED_DOCUMENTS_EXTENSIONS, ...SUPPORTED_IMAGE_EXTENSIONS],
}: FileUploadProps & {
  file: File;
  toast: ToastContextType;
  translations: ReturnType<typeof useTranslations>;
  allowedFileExtensions?: readonly string[];
}) {
  if (!validateFileUpload({ file, allowedFileExtensions, toast, translations })) {
    return;
  }

  const localId = nanoid();
  setFiles((previousFiles) => {
    const updatedFiles = new Map(previousFiles);
    updatedFiles.set(localId, {
      file,
      status: 'uploading',
      fileId: undefined,
    });
    return updatedFiles;
  });

  try {
    const uploadFn = fileUploadFn ?? defaultUploadFile;
    const blobFile = new Blob([file], { type: file.type });
    const response = await uploadFn(new File([blobFile], file.name, { type: file.type }));

    if (!response.fileId) {
      throw new Error('Upload response did not include fileId');
    }

    setFiles((previousFiles) => {
      const updatedFiles = new Map(previousFiles);
      const fileState = updatedFiles.get(localId);
      if (fileState) {
        updatedFiles.set(localId, {
          ...fileState,
          status: 'processed',
          fileId: response.fileId,
        });
      }
      return updatedFiles;
    });
    await onFileUploaded?.({ id: response.fileId, name: file.name, file });
    if (showUploadConfirmation) toast.success(translations('toasts.upload-success'));
  } catch (error) {
    logError('File upload error', error);
    setFiles((previousFiles) => {
      const updatedFiles = new Map(previousFiles);
      updatedFiles.delete(localId);
      return updatedFiles;
    });
    toast.error(translations('toasts.upload-error'));
  }
}

export async function defaultUploadFile(file: File): Promise<FileUploadResponse> {
  const response = await fetchUploadFile({
    body: file,
    contentType: file.type,
    fileName: file.name,
  });

  return response;
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
