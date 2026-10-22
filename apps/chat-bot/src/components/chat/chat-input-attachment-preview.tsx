import { getFileNameAndFileExtension, isImageFile } from '@/utils/files/generic';
import React from 'react';
import { LocalFileState } from '../file-upload/upload-file';
import CrossIcon from '../icons/cross';
import DeattachFileIcon from '../icons/file-upload-icons/deattach-file-icon';
import { getFileIconByFileExtension } from '../icons/file-upload-icons/file-icons-dict';
import Spinner from '../icons/spinner';
import DisplayFileAttachment from './display-file-attachment';

type ChatInputAttachmentPreviewProps = {
  file: LocalFileState;
  onDeattachFile?: () => void;
  height?: 'default' | 'large';
  width?: 'default' | 'small';
};

export default function ChatInputAttachmentPreview({
  file,
  onDeattachFile,
  height = 'default',
  width = 'default',
}: ChatInputAttachmentPreviewProps) {
  const fileName = file.file.name;
  const isImage = isImageFile(fileName);
  const [imageUrl, setImageUrl] = React.useState<string>();
  const [, fileExtension] = getFileNameAndFileExtension(fileName);
  const { fillColor: backgroundColor } = getFileIconByFileExtension(fileExtension);
  React.useEffect(() => {
    if (!isImage) return;
    const objectUrl = URL.createObjectURL(file.file);
    const animationFrame = requestAnimationFrame(() => setImageUrl(objectUrl));
    return () => {
      cancelAnimationFrame(animationFrame);
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, isImage]);
  if (isImage)
    return (
      <div className="flex items-center justify-center text-sm relative group">
        <div
          className="absolute inset-0 opacity-5 rounded-enterprise-sm"
          style={{ backgroundColor }}
        />
        {onDeattachFile !== undefined && (
          <button
            type="button"
            onClick={onDeattachFile}
            className="absolute right-0 top-0 bg-neutral-50 z-10 rounded-enterprise-tr-sm"
          >
            <DeattachFileIcon />
          </button>
        )}
        <div className="relative flex items-center gap-2 h-14 w-14 overflow-hidden rounded-enterprise-sm">
          {imageUrl !== undefined ? (
            <>
              <span className="sr-only">{fileName}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={fileName} className="w-full h-full object-cover" />
              {file.status === 'uploading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Spinner className="size-5" />
                </div>
              )}
            </>
          ) : file.status === 'uploading' ? (
            <Spinner className="w-14 h-5" />
          ) : (
            <CrossIcon className="w-5 h-5" />
          )}
        </div>
      </div>
    );
  return (
    <DisplayFileAttachment
      fileName={fileName}
      status={file.status}
      onDeattachFile={onDeattachFile}
      height={height}
      width={width}
    />
  );
}
