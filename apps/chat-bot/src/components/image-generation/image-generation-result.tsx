import { useTranslations } from 'next-intl';
import MessageImageAttachment, { ImageAttachment } from '../chat/message-image-attachment';
import { CopyPromptButton } from './copy-prompt-button';

export function ImageGenerationResult({
  prompt,
  attachedFiles,
  children,
}: {
  prompt: string;
  attachedFiles: ImageAttachment[];
  children: React.ReactNode;
}) {
  const tImageGeneration = useTranslations('image-generation');

  return (
    <div>
      <h3 className="text-xs text-gray-700">{tImageGeneration('prompt-label')}</h3>
      <p className="text-sm mb-3">
        {prompt}
        <CopyPromptButton prompt={prompt} />
      </p>
      {attachedFiles.length > 0 && (
        <>
          <h3 className="text-xs text-gray-700">{tImageGeneration('attached-files-label')}</h3>
          <div className="flex flex-row gap-2 overflow-auto mt-2 mb-5">
            {attachedFiles.map((file) => (
              <MessageImageAttachment
                key={file.id}
                file={file}
                width={480}
                height={160}
                className="h-20 w-auto max-w-60 max-h-none object-cover aspect-auto"
              />
            ))}
          </div>
        </>
      )}
      {children}
    </div>
  );
}
