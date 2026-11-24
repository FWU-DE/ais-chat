import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';

import { getFileNameAndFileExtension } from '@/utils/files/generic';
import { cn } from '@/utils/tailwind';

import DeattachFileIcon from '../icons/file-upload-icons/deattach-file-icon';
import { getFileIconByFileExtension } from '../icons/file-upload-icons/file-icons-dict';
import Spinner from '../icons/spinner';

type DisplayFileAttachmentProps = {
  fileName: string;
  status?: 'success' | 'processed' | 'uploading';
  onDeattachFile?: () => void;
  onDownload?: () => void;
  downloadLabel?: string;
  downloadDisabled?: boolean;
  height?: 'default' | 'large';
  width?: 'default' | 'small';
};

export default function DisplayFileAttachment({
  fileName,
  status = 'processed',
  onDeattachFile,
  onDownload,
  downloadLabel,
  downloadDisabled = false,
  height = 'default',
  width = 'default',
}: DisplayFileAttachmentProps) {
  const [fileStem, fileExtension] = getFileNameAndFileExtension(fileName);
  const { Icon: FileIcon, fillColor: backgroundColor } = getFileIconByFileExtension(fileExtension);
  return (
    <div
      className={cn(
        'flex w-fit min-w-0 max-w-full shrink-0 items-center justify-start gap-2 pl-4 text-sm relative group',
        onDownload === undefined ? 'pr-6' : 'pr-2',
        height === 'large' ? 'py-0 h-14' : 'py-2',
      )}
    >
      <div className="absolute inset-0 opacity-5 rounded-lg" style={{ backgroundColor }} />
      {onDeattachFile !== undefined && (
        <button
          type="button"
          onClick={onDeattachFile}
          className="absolute right-0 top-0 hover:bg-neutral-200"
        >
          <DeattachFileIcon />
        </button>
      )}
      <div
        className={cn(
          'relative flex items-center gap-2 min-w-0',
          height === 'large' ? 'h-14' : 'h-6',
        )}
      >
        {status === 'processed' && (
          <FileIcon className="h-5 w-5 shrink-0" color={backgroundColor} />
        )}
        {status === 'uploading' && <Spinner className="h-5 w-5 shrink-0" />}
        <div className={cn('flex min-w-0 flex-col', width === 'small' ? 'max-w-24' : 'max-w-80')}>
          <p className="truncate overflow-hidden text-sm" title={fileName}>
            {fileStem}
          </p>
        </div>
      </div>
      {onDownload !== undefined && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDownload}
          disabled={downloadDisabled}
          aria-label={downloadLabel}
          title={downloadLabel}
          className="relative text-primary"
        >
          <DownloadSimpleIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}
