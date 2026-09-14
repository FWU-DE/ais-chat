import { useTranslations } from 'next-intl';
import AutoResizeTextarea from '../common/auto-resize-textarea';
import { CHAT_MESSAGE_LENGTH_LIMIT } from '@/configuration-text-inputs/const';
import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useRef } from 'react';
import { Button } from '@ui/components/button';
import { LocalFileState } from '../chat/send-message-form';
import { FileUploadResponse, handleSingleFile } from '../chat/upload-file-button';
import AttachFileIcon from '../icons/attach-file';
import { useToast } from '../common/toast';
import { cn } from '@/utils/tailwind';
import { iconClassName } from '@/utils/tailwind/icon';
import ChatInputAttachmentPreview from '../chat/chat-input-attachment-preview';

type ImageGenerationInputBoxProps = {
  isLoading: boolean;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  customHandleSubmit: (e: FormEvent) => Promise<void>;
  input: string;
  files: Map<string, LocalFileState>;
  setFiles: Dispatch<SetStateAction<Map<string, LocalFileState>>>;
  handleDeattachFile: (localId: string) => void;
  fileUploadFn: (file: File) => Promise<FileUploadResponse>;
  supportedImageFormats: string[] | null | undefined;
  maxFiles: number;
  isEditMode?: boolean;
};

export function ImageGenerationInputBox({
  isLoading,
  handleInputChange,
  customHandleSubmit,
  input,
  files,
  setFiles,
  handleDeattachFile,
  fileUploadFn,
  supportedImageFormats,
  maxFiles,
  isEditMode = false,
}: ImageGenerationInputBoxProps) {
  const tImageGeneration = useTranslations('image-generation');
  const tFileInteraction = useTranslations('file-interaction');
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadLimitReached = files.size >= maxFiles;

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files;
    if (selected === null) return;

    const accepted = Array.from(selected).slice(0, maxFiles - files.size);
    const rejectedCount = selected.length - accepted.length;

    if (rejectedCount > 0) {
      toast.error(
        tFileInteraction('upload.image-limit-reached', {
          max_images: maxFiles,
          images_exceeded: rejectedCount,
        }),
      );
    }

    await Promise.all(
      accepted.map((file) =>
        handleSingleFile({
          file,
          setFiles,
          fileUploadFn,
          toast,
          translations: tFileInteraction,
        }),
      ),
    );

    if (fileInputRef.current !== null) {
      fileInputRef.current.value = '';
    }
  }

  const hasUploadingFile = Array.from(files.values()).some((f) => f.status === 'uploading');
  const canUploadImages = (supportedImageFormats?.length ?? 0) > 0;
  const acceptedFileExtensions = (supportedImageFormats ?? [])
    .map((format) => `.${format}`)
    .join(',');

  const placeholderText = isEditMode
    ? tImageGeneration('edit-placeholder')
    : tImageGeneration('placeholder');
  const submitButtonText = isEditMode
    ? tImageGeneration('edit-button')
    : tImageGeneration('generate-button');

  return (
    <div className={cn(isEditMode && 'bg-[#F1EFF4] border border-primary/20 rounded-2xl p-4')}>
      {isEditMode && (
        <p className="mb-2 text-base font-medium">{tImageGeneration('edit-heading')}</p>
      )}
      <div
        className={cn(
          'relative bg-white w-full p-3 border focus-within:border-primary',
          isEditMode ? 'rounded-lg' : 'rounded-xl',
        )}
      >
        <div className="flex items-start">
          <AutoResizeTextarea
            /* eslint-disable-next-line jsx-a11y/no-autofocus */
            autoFocus
            placeholder={placeholderText}
            data-testid="image-prompt-input"
            className="w-full text-base focus:outline-hidden bg-transparent max-h-40 sm:max-h-60 overflow-y-auto placeholder:text-muted-foreground py-3 px-4"
            onChange={handleInputChange}
            value={input}
            maxLength={CHAT_MESSAGE_LENGTH_LIMIT}
            disabled={isLoading}
          />
          {canUploadImages && (
            <>
              <input
                hidden
                multiple
                type="file"
                ref={fileInputRef}
                onChange={onFileChange}
                accept={acceptedFileExtensions}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(iconClassName, 'my-2 mx-1 disabled:cursor-not-allowed')}
                disabled={isLoading || uploadLimitReached}
                aria-label={tFileInteraction('upload.upload-file-button')}
                title={
                  uploadLimitReached
                    ? tFileInteraction('upload.upload-file-button-disabled', {
                        max_files: maxFiles,
                      })
                    : tFileInteraction('upload.upload-file-button')
                }
                data-testid="image-generation-upload-button"
              >
                <AttachFileIcon className="sm:w-10 sm:h-10 w-8 h-8" stroke="black" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2">
        <div className="flex flex-1 flex-wrap gap-1 min-w-0">
          {Array.from(files).map(([localId, file]) => (
            <ChatInputAttachmentPreview
              key={localId}
              file={file}
              onDeattachFile={isLoading ? undefined : () => handleDeattachFile(localId)}
              height="large"
              width="small"
            />
          ))}
        </div>
        <Button
          type="button"
          onClick={customHandleSubmit}
          disabled={input.trim().length === 0 || isLoading || hasUploadingFile}
          aria-label={submitButtonText}
          data-testid="image-generate-button"
          className="shrink-0"
        >
          {submitButtonText}
        </Button>
      </div>
    </div>
  );
}
