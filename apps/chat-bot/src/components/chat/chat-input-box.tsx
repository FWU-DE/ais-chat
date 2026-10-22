import {
  CHAT_MESSAGE_LENGTH_LIMIT,
  NUMBER_OF_FILES_LIMIT,
  NUMBER_OF_IMAGES_LIMIT,
} from '@/configuration-text-inputs/const';
import { isImageFile } from '@/utils/files/generic';
import { cn } from '@/utils/tailwind';
import { iconClassName } from '@/utils/tailwind/icon';
import { useTranslations } from 'next-intl';
import {
  ChangeEvent,
  Dispatch,
  KeyboardEvent,
  SetStateAction,
  startTransition,
  SyntheticEvent,
  useEffect,
} from 'react';
import AutoResizeTextarea from '../common/auto-resize-textarea';
import { useToast } from '../common/toast';
import type { FileUploadResponse, LocalFileState } from '../file-upload/upload-file';
import { useFileUpload } from '../file-upload/use-file-upload';
import ArrowRightIcon from '../icons/arrow-right';
import StopIcon from '../icons/stop';
import ChatInputAttachmentPreview from './chat-input-attachment-preview';
import UploadFileButton from './upload-file-button';

export function ChatInputBox({
  files,
  setFiles,
  isGenerating,
  handleDeattachFile,
  handleInputChange,
  handleStopGeneration,
  customHandleSubmit,
  input,
  enableFileUpload = false,
  fileUploadFn,
  showPlaceholder = true,
}: {
  files?: Map<string, LocalFileState>;
  setFiles?: Dispatch<SetStateAction<Map<string, LocalFileState>>>;
  isGenerating: boolean;
  handleDeattachFile?: (localId: string) => void;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handleStopGeneration: () => void;
  customHandleSubmit: (e: SyntheticEvent) => Promise<void>;
  input: string;
  enableFileUpload?: boolean;
  fileUploadFn?: (file: File) => Promise<FileUploadResponse>;
  showPlaceholder?: boolean;
}) {
  const tCommon = useTranslations('common');
  const tFileInteraction = useTranslations('file-interaction');
  const toast = useToast();
  const { allowedFileExtensions, handlePaste, hasUploadingFiles, uploadFiles } = useFileUpload({
    files,
    setFiles,
    fileUploadFn,
  });

  useEffect(() => {
    if (files && setFiles && files.size > NUMBER_OF_FILES_LIMIT) {
      toast.error(
        tFileInteraction('upload.file-limit-reached', {
          max_files: NUMBER_OF_FILES_LIMIT,
          files_exceeded: files.size - NUMBER_OF_FILES_LIMIT,
        }),
      );
      const trimmedFiles = new Map(Array.from(files.entries()).slice(0, NUMBER_OF_FILES_LIMIT));
      startTransition(() => {
        setFiles(trimmedFiles);
      });
    }
    const imageEntries = Array.from(files?.entries() ?? []).filter(([, file]) =>
      isImageFile(file.file.name),
    );
    const numberOfImages = imageEntries.length;

    if (files && setFiles && numberOfImages > NUMBER_OF_IMAGES_LIMIT) {
      const newFiles = new Map(files);
      const imagesExceedingLimit = imageEntries.slice(NUMBER_OF_IMAGES_LIMIT);
      toast.error(
        tFileInteraction('upload.image-limit-reached', {
          max_images: NUMBER_OF_IMAGES_LIMIT,
          images_exceeded: imagesExceedingLimit.length,
        }),
      );
      // pop off all images exceeding the limit
      imagesExceedingLimit.forEach(([localId]) => {
        newFiles.delete(localId);
      });
      startTransition(() => {
        setFiles(newFiles);
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const canSubmit = input.trim().length > 0 && !hasUploadingFiles;

  async function handleSubmitOnEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !isGenerating && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        await customHandleSubmit(e);
      }
    }
  }

  /** Either Send or StopGeneration */
  const userActionButton = isGenerating ? (
    <button
      type="button"
      title="Stop generating"
      onClick={handleStopGeneration}
      className={cn(
        'p-1.5 my-2 flex items-center justify-center group disabled:cursor-not-allowed me-2',
        iconClassName,
      )}
      aria-label="Stop"
    >
      <StopIcon className={cn('w-6 h-6')} />
    </button>
  ) : (
    <button
      type="submit"
      title="Nachricht abschicken"
      disabled={!canSubmit}
      className={cn(
        iconClassName,
        'my-2 mx-2 flex items-center self-end justify-center group disabled:cursor-not-allowed text-dark-gray',
      )}
      aria-label="Nachricht abschicken"
      data-testid="submit-button"
    >
      <ArrowRightIcon className={cn('h-9 w-9')} />
    </button>
  );

  return (
    <>
      <form
        onSubmit={customHandleSubmit}
        className="relative bg-white w-full p-1 border focus-within:border-primary rounded-xl"
      >
        {files !== undefined && handleDeattachFile !== undefined && files.size > 0 && (
          <div className="mx-2 py-2 flex gap-1 overflow-x-auto">
            {Array.from(files).map(([localId, file]) => (
              <ChatInputAttachmentPreview
                key={localId}
                file={file}
                onDeattachFile={() => handleDeattachFile(localId)}
                height="large"
                width="small"
              />
            ))}
          </div>
        )}
        <div className="flex items-center bg-background">
          <AutoResizeTextarea
            /* eslint-disable-next-line jsx-a11y/no-autofocus */
            autoFocus
            placeholder={showPlaceholder ? tCommon('send-message-placeholder') : ''}
            className="w-full text-base focus:outline-hidden max-h-40 sm:max-h-60 overflow-y-auto placeholder:text-muted-foreground p-2"
            onChange={handleInputChange}
            value={input}
            onKeyDown={handleSubmitOnEnter}
            onPaste={enableFileUpload ? handlePaste : undefined}
            maxLength={CHAT_MESSAGE_LENGTH_LIMIT}
            data-testid="chat-input"
          />
          {enableFileUpload && files !== undefined && setFiles !== undefined && (
            <div className="flex flex-row gap-x-3 rounded-enterprise-sm">
              <UploadFileButton
                className={iconClassName}
                files={files}
                allowedFileExtensions={allowedFileExtensions}
                onFilesSelected={uploadFiles}
              />
            </div>
          )}
          {userActionButton}
        </div>
      </form>
      <span className="text-xs mt-2 font-normal text-main-900 flex self-center text-center">
        {tCommon('information-disclaimer')}
      </span>
    </>
  );
}
