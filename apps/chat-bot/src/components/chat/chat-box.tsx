import { FileModel } from '@shared/db/schema';
import MessageImageAttachment, { type PendingFileModel } from './message-image-attachment';
import CopyToClipboardButton from '../common/clipboard-button';
import ReloadIcon from '../icons/reload';
import MarkdownDisplay from './markdown-display';
import { cn } from '@/utils/tailwind';
import { useTranslations } from 'next-intl';
import Citation from './sources/citation';
import { iconClassName } from '@/utils/tailwind/icon';
import useBreakpoints from '../hooks/use-breakpoints';
import { isImageFile } from '@/utils/files/generic';
import { type UIMessage, type ChatStatus } from '@/types/chat';
import { ReactNode } from 'react';
import { WebSource } from '@shared/db/types';
import {
  WebSearchSourcesButton,
  WebSearchSourcesDialog,
  WebSearchSourcesPanel,
  useWebSearchSourcesDisclosure,
} from './sources/web-search-sources';
import DownloadConversationMessageButton from './download-conversation-message-button';
import { utils } from '@shared/utils';
import DisplayFileAttachment from './display-file-attachment';

// Re-export for consumers
export type { PendingFileModel };

export function ChatBox({
  assistantIcon,
  children,
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
  showWebSourcesInDialog = false,
}: {
  assistantIcon?: ReactNode;
  children: UIMessage;
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
  showWebSourcesInDialog?: boolean;
}) {
  const tCommon = useTranslations('common');
  const { isAtLeast } = useBreakpoints();
  const {
    isOpen: isAssistantSourcesOpen,
    panelRef,
    openOrScrollIntoView,
    toggleOpen,
  } = useWebSearchSourcesDisclosure();

  const userClassName =
    children.role === 'user'
      ? 'w-fit p-4 rounded-2xl rounded-br-none self-end bg-secondary/30 max-w-[70%] wrap-break-word'
      : 'w-full min-w-0';

  // Check both DB file mapping and pending files for this message
  const dbFiles = fileMapping?.get(children.id);
  const pendingFiles = pendingFileMapping?.get(children.id);
  // Prefer DB files if available (they're persisted), otherwise use pending files.
  // Reuse an already created blob URL so the image does not have to be fetched again.
  const allFiles =
    dbFiles?.map((file) => {
      const localUrl = pendingFiles?.find((pendingFile) => pendingFile.id === file.id)?.localUrl;
      return localUrl === undefined ? file : { ...file, localUrl };
    }) ?? pendingFiles;
  const hasFiles = allFiles !== undefined && allFiles.length > 0;

  const parsedUrls =
    children.role === 'user' ? (utils.url.parseHyperlinks(children.content) ?? []) : [];
  const userWebSources = children.role === 'user' ? [...(webSources ?? [])] : [];
  const assistantWebSearchSources =
    children.role === 'assistant' ? (children.webSearchResults ?? []) : [];

  for (const url of parsedUrls) {
    if (userWebSources.find((source) => source.link === url) === undefined) {
      userWebSources.push({ link: url });
    }
  }

  // Separate image files from non-image files
  const imageFiles = allFiles?.filter((file) => isImageFile(file.name)) ?? [];
  const nonImageFiles = allFiles?.filter((file) => !isImageFile(file.name)) ?? [];

  const maybeFileAttachment =
    hasFiles && children.role === 'user' ? (
      <div className="flex w-full min-w-0 flex-col items-end gap-4 self-end pb-0 pt-0 mb-4">
        {/* Display images */}
        {imageFiles.length > 0 && (
          <div className="flex flex-row gap-2 overflow-auto">
            {imageFiles.map((file) => (
              <MessageImageAttachment file={file} key={file.id} />
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

  const maybeAssistantWebSearchSources =
    assistantWebSearchSources.length > 0 && !showWebSourcesInDialog ? (
      <WebSearchSourcesPanel
        sources={assistantWebSearchSources}
        isOpen={isAssistantSourcesOpen}
        onToggle={toggleOpen}
        panelId={`assistant-web-sources-${children.id}`}
        panelRef={panelRef}
      />
    ) : null;

  const margin =
    allFiles !== undefined || userWebSources.length > 0 || maybeAssistantWebSearchSources !== null
      ? 'm-0 mt-4'
      : 'm-4';

  const maybeShowMessageIcons =
    isLastNonUser && status !== 'streaming' ? (
      <div className="flex items-center gap-1 mt-1">
        <CopyToClipboardButton text={children.content} className="size-5" />
        {status === 'ready' &&
          conversationId !== undefined &&
          children.id !== 'initial-message' && (
            <DownloadConversationMessageButton
              conversationId={conversationId}
              messageId={children.id}
              characterName={characterName}
            />
          )}
        <button
          title={tCommon('regenerate-message')}
          type="button"
          onClick={() => regenerateMessage()}
          aria-label="Reload"
        >
          <div className={cn('p-1.5 rounded-enterprise-sm', iconClassName)}>
            <ReloadIcon className="w-5 h-5" />
          </div>
        </button>
        {assistantWebSearchSources.length > 0 &&
          (showWebSourcesInDialog ? (
            <WebSearchSourcesDialog sources={assistantWebSearchSources} />
          ) : (
            <WebSearchSourcesButton
              panelId={`assistant-web-sources-${children.id}`}
              onClick={openOrScrollIntoView}
            />
          ))}
      </div>
    ) : null;

  const messageContent = <MarkdownDisplay>{children.content}</MarkdownDisplay>;

  return (
    <>
      <div key={index} className={cn('w-full', userClassName, margin)}>
        <div aria-label={`${children.role} message ${Math.floor(index / 2 + 1)}`}>
          <div className={cn('flex min-w-0', isAtLeast.sm ? 'flex-row' : 'flex-col')}>
            {children.role === 'assistant' && assistantIcon}
            <div
              className={cn(
                'flex flex-col items-start gap-2',
                children.role === 'assistant' && 'w-full min-w-0',
              )}
            >
              {maybeAssistantWebSearchSources}
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
