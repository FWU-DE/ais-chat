import { type ChatStatus, type UIMessage } from '@/types/chat';
import { isImageFile } from '@/utils/files/generic';
import { cn } from '@/utils/tailwind';
import { FileModel } from '@shared/db/schema';
import { WebSource } from '@shared/db/types';
import { utils } from '@shared/utils';
import { ReactNode } from 'react';
import useBreakpoints from '../hooks/use-breakpoints';
import { AiActivityPanel } from './activity/ai-activity';
import DisplayFileAttachment from './display-file-attachment';
import MarkdownDisplay from './markdown-display';
import { MessageActions } from './message-actions';
import MessageImageAttachment, { type PendingFileModel } from './message-image-attachment';
import Citation from './sources/citation';

// Re-export for consumers
export type { PendingFileModel };

export function ChatBox({
  assistantIcon,
  message,
  fileMapping,
  pendingFileMapping,
  index,
  webSources,
  isLastNonUser,
  isLoading,
  regenerateMessage,
  conversationId,
  characterName,
  status,
  showActivityDialog,
  generateSpeechFn,
  isSpeechModelEnabled,
}: {
  assistantIcon?: ReactNode;
  message: UIMessage;
  fileMapping?: Map<string, FileModel[]>;
  pendingFileMapping?: Map<string, PendingFileModel[]>;
  index: number;
  webSources?: WebSource[];
  isLastNonUser: boolean;
  isLoading: boolean;
  regenerateMessage: () => void;
  conversationId?: string;
  characterName?: string;
  status: ChatStatus;
  showActivityDialog?: boolean;
  generateSpeechFn: (text: string) => Promise<Blob>;
  isSpeechModelEnabled: boolean;
}) {
  const { isAtLeast } = useBreakpoints();

  const userClassName =
    message.role === 'user'
      ? 'w-fit p-4 rounded-2xl rounded-br-none self-end bg-secondary/30 max-w-[70%] wrap-break-word'
      : 'w-full min-w-0';

  // Check both DB file mapping and pending files for this message
  const dbFiles = fileMapping?.get(message.id);
  const pendingFiles = pendingFileMapping?.get(message.id);
  // Prefer DB files if available (they're persisted), otherwise use pending files.
  // Reuse an already created blob URL so the image does not have to be fetched again.
  const allFiles =
    dbFiles?.map((file) => {
      const localUrl = pendingFiles?.find((pendingFile) => pendingFile.id === file.id)?.localUrl;
      return localUrl === undefined ? file : { ...file, localUrl };
    }) ?? pendingFiles;
  const hasFiles = allFiles !== undefined && allFiles.length > 0;

  const parsedUrls =
    message.role === 'user' ? (utils.url.parseHyperlinks(message.content) ?? []) : [];
  const userWebSources = message.role === 'user' ? [...(webSources ?? [])] : [];
  const activitySteps = message.role === 'assistant' ? (message.activitySteps ?? []) : [];

  for (const url of parsedUrls) {
    if (userWebSources.find((source) => source.link === url) === undefined) {
      userWebSources.push({ link: url });
    }
  }

  // Separate image files from non-image files
  const imageFiles = allFiles?.filter((file) => isImageFile(file.name)) ?? [];
  const nonImageFiles = allFiles?.filter((file) => !isImageFile(file.name)) ?? [];

  const maybeFileAttachment =
    hasFiles && message.role === 'user' ? (
      <div className="flex w-full min-w-0 flex-col items-end gap-4 self-end pb-0 pt-0 mb-4">
        {/* Display images */}
        {imageFiles.length > 0 && (
          <div className="flex flex-row gap-2 overflow-auto">
            {imageFiles.map((file) => (
              // The authenticated scaled-image fallback only works for files owned by the current user (fileMapping).
              <MessageImageAttachment
                file={file}
                key={file.id}
                allowFallbackUrl={fileMapping !== undefined}
              />
            ))}
          </div>
        )}
        {/* Display non-image files */}
        {nonImageFiles.length > 0 && (
          <div className="flex w-fit max-w-full min-w-0 flex-row flex-wrap justify-end gap-2 overflow-hidden">
            {nonImageFiles.map((file) => (
              <DisplayFileAttachment fileName={file.name} key={file.id} />
            ))}
          </div>
        )}
      </div>
    ) : null;

  const maybeUserWebSources =
    userWebSources.length > 0 && (!isLoading || !isLastNonUser) ? (
      <div
        className="relative flex flex-wrap text-ellipsis gap-2 self-end mt-1 mb-2 w-[70%]"
        dir="rtl"
      >
        {userWebSources.map((webSource, sourceIndex) => {
          return (
            <Citation
              className="p-0"
              key={`user-link-${index}-${sourceIndex}`}
              webSource={webSource}
            />
          );
        })}
      </div>
    ) : null;

  const AiActivity =
    activitySteps.length > 0 && !showActivityDialog && !(isLoading && isLastNonUser) ? (
      <AiActivityPanel steps={activitySteps} panelId={`assistant-ai-activity-${message.id}`} />
    ) : null;

  const margin =
    allFiles !== undefined || userWebSources.length > 0 || AiActivity !== null ? 'm-0 mt-4' : 'm-4';

  const maybeShowMessageIcons =
    isLastNonUser && status !== 'streaming' ? (
      <MessageActions
        message={message}
        status={status}
        conversationId={conversationId}
        characterName={characterName}
        regenerateMessage={regenerateMessage}
        generateSpeechFn={generateSpeechFn}
        isSpeechModelEnabled={isSpeechModelEnabled}
        showActivityDialog={showActivityDialog}
        activitySteps={activitySteps}
      />
    ) : null;

  const messageContent = <MarkdownDisplay>{message.content}</MarkdownDisplay>;

  return (
    <>
      {AiActivity}
      <div key={index} className={cn('w-full', userClassName, margin)}>
        <div aria-label={`${message.role} message ${Math.floor(index / 2 + 1)}`}>
          <div className={cn('flex min-w-0', isAtLeast.sm ? 'flex-row' : 'flex-col')}>
            {message.role === 'assistant' && assistantIcon}
            <div
              className={cn(
                'flex flex-col items-start gap-2',
                message.role === 'assistant' && 'w-full min-w-0',
              )}
            >
              {messageContent}
              {maybeShowMessageIcons}
            </div>
          </div>
        </div>
      </div>
      {maybeUserWebSources}
      {maybeFileAttachment}
    </>
  );
}
