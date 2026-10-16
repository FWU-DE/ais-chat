import DestructiveActionButton from '@/components/common/destructive-action-button';
import DownloadFileButton from '@/components/common/download-file-button';
import { FileModel } from '@shared/db/schema';

import { formatBytes, getFileNameAndFileExtension } from '@/utils/files/generic';
import { cn } from '@/utils/tailwind';
import { TrashSimpleIcon } from '@phosphor-icons/react';
import { ServerActionResult } from '@shared/actions/server-action-result';
import { isNotNull } from '@shared/utils/guard';
import { useTranslations } from 'next-intl';
import { useToast } from '../../common/toast';
import { FileStatus, LocalFileState } from '../../file-upload/upload-file';
import CrossIcon from '../../icons/cross';
import { getFileIconByFileExtension } from '../../icons/file-upload-icons/file-icons-dict';
import Spinner from '../../icons/spinner';

type FilesTableProps = {
  files: FileModel[];
  additionalFiles: Map<string, LocalFileState>;
  onDeleteFile(fileId: string): Promise<void>;
  className?: string;
  readOnly: boolean;
  onDownloadFile?: (fileId: string) => Promise<ServerActionResult<string | undefined>>;
};

export default function FilesTable({
  files,
  onDeleteFile,
  additionalFiles,
  className,
  readOnly,
  onDownloadFile,
}: FilesTableProps) {
  const t = useTranslations('file-interaction');
  const toast = useToast();
  if (files.length < 1 && additionalFiles.size < 1) return null;

  async function handleDeleteFile(fileId: string) {
    await onDeleteFile(fileId);
    toast.success(t('toasts.delete-from-form'));
  }

  const mergedFiles = [
    ...files.map((f) => ({
      id: f.id,
      size: f.size,
      fileName: f.name,
      status: 'processed' as const,
    })),
    ...Array.from(additionalFiles)
      .map(([id, fileObject]) => {
        if (fileObject.file.type === 'image') {
          return null;
        }
        return {
          id: fileObject.fileId ?? id,
          fileName: fileObject.file.name,
          size: fileObject.file.size,
          status: fileObject.status,
        };
      })
      .filter(isNotNull),
  ] satisfies {
    id: string | undefined;
    fileName: string;
    size: number;
    status: FileStatus;
  }[];
  return (
    <div className={cn('w-full', className)}>
      {mergedFiles
        .filter(({ status }) => status !== 'failed')
        .map(({ id, fileName, size, status }) => {
          const [fileStem, extension] = getFileNameAndFileExtension(fileName);
          const { Icon, fillColor } = getFileIconByFileExtension(extension);

          return (
            <div
              key={id}
              className="flex items-center justify-between gap-4 border-b border-border last:border-b-0 p-2"
            >
              <div className="flex gap-2 items-center flex-1 min-w-0">
                {status === 'processed' && (
                  <Icon className="w-9 h-9 p-1.5 shrink-0" color={fillColor} />
                )}
                {status === 'uploading' && <Spinner className="w-9 h-9 p-1.5 shrink-0" />}
                {status === 'failed' && (
                  <CrossIcon className="w-9 h-9 p-1.5 text-destructive shrink-0" />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate" title={fileName}>
                    {fileStem}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm whitespace-nowrap">{formatBytes(size)}</span>
                {status === 'uploading' && (
                  <span className="text-sm text-muted-foreground">{t('upload.uploading')}</span>
                )}
                {status === 'processed' && onDownloadFile && (
                  <DownloadFileButton fileId={id} onDownloadFile={onDownloadFile} />
                )}
                {status === 'processed' && !readOnly && (
                  <DestructiveActionButton
                    aria-label={t('delete.button')}
                    modalDescription={t('delete.modal-description')}
                    triggerButtonVariant="ghost"
                    triggerButtonSize="icon-round"
                    triggerButtonClassName="text-primary"
                    modalTitle={t('delete.modal-title')}
                    confirmText={t('delete.confirm')}
                    actionFn={() => handleDeleteFile(id)}
                  >
                    <TrashSimpleIcon className="size-6 text-primary" />
                    <span className="sr-only">{t('delete.button')}</span>
                  </DestructiveActionButton>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}
