import { NUMBER_OF_FILES_LIMIT_FOR_SHARED_CHAT } from '@/configuration-text-inputs/const';
import { ServerActionResult } from '@shared/actions/server-action-result';
import { FileModel } from '@shared/db/schema';
import { useTranslations } from 'next-intl';
import React from 'react';
import { useToast } from '../../common/toast';
import { LocalFileState } from '../../file-upload/upload-file';
import { FileDrop } from './file-drop-area';
import FilesTable from './file-upload-table';

export type CustomChatFilesProps = {
  initialFiles: FileModel[];
  onFileUploaded?: (data: { id: string; name: string; file: File }) => void | Promise<void>;
  onDeleteFile?: (fileId: string) => Promise<ServerActionResult<void>>;
  onDownloadFile?: (fileId: string) => Promise<ServerActionResult<string | undefined>>;
};

export function CustomChatFiles(props: CustomChatFilesProps) {
  const { initialFiles, onFileUploaded: onFileUploaded, onDeleteFile, onDownloadFile } = props;
  const [additionalFiles, setAdditionalFiles] = React.useState(new Map<string, LocalFileState>());
  const [currentFiles, setCurrentFiles] = React.useState<FileModel[]>(initialFiles);
  const toast = useToast();
  const t = useTranslations('custom-chat.files-and-links');

  const handleDeleteFile = async (localFileId: string) => {
    if (!onDeleteFile) return;

    const fileId =
      [...additionalFiles.values()].find((f) => f.fileId === localFileId)?.fileId ??
      currentFiles.find((f) => f.id === localFileId)?.id;
    if (fileId === undefined) return;

    const result = await onDeleteFile(fileId);
    if (result.success) {
      setAdditionalFiles(
        (prev) =>
          new Map(
            [...prev.entries()].filter(([k, f]) => k !== localFileId && f.fileId !== localFileId),
          ),
      );
      setCurrentFiles((prev) => prev.filter((f) => f.id !== fileId));
    } else {
      toast.error(t('file-delete-error'));
    }
  };

  const totalFileCount = currentFiles.length + additionalFiles.size;

  return (
    <>
      {onFileUploaded && (
        <FileDrop
          setFiles={setAdditionalFiles}
          disabled={totalFileCount >= NUMBER_OF_FILES_LIMIT_FOR_SHARED_CHAT}
          countOfFiles={totalFileCount}
          onFileUploaded={onFileUploaded}
          showUploadConfirmation={true}
        />
      )}
      <FilesTable
        files={currentFiles}
        additionalFiles={additionalFiles}
        onDeleteFile={handleDeleteFile}
        readOnly={!onDeleteFile}
        onDownloadFile={onDownloadFile}
      />
    </>
  );
}
