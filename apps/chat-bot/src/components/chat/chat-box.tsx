import { type ChatStatus, type UIMessage } from '@/types/chat';
import { replacePlotBlocks } from '@/utils/code-blocks';
import { isImageFile } from '@/utils/files/generic';
import { cn } from '@/utils/tailwind';
import { FileModel } from '@shared/db/schema';
import { WebSource } from '@shared/db/types';
import { utils } from '@shared/utils';
import { useTranslations } from 'next-intl';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import useBreakpoints from '../hooks/use-breakpoints';
import { AiActivityPanel } from './activity/ai-activity';
import DisplayFileAttachment from './display-file-attachment';
import MarkdownDisplay from './markdown-display';
import { MessageActions } from './message-actions';
import MessageImageAttachment, { type PendingFileModel } from './message-image-attachment';
import { PlotStreamingContext } from './plot/plot-block';
import Citation from './sources/citation';
import AudioPlayer from './speech/audio-player';
import { GenerateSpeechStreamFn } from './speech/types';

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
  canRegenerateMessage,
  conversationId,
  characterName,
  status,
  showActivityDialog,
  generateSpeechStreamFn,
  speechVoice,
  isSpeechModelEnabled,
  speechOnly,
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
  canRegenerateMessage: boolean;
  conversationId?: string;
  characterName?: string;
  status: ChatStatus;
  showActivityDialog?: boolean;
  generateSpeechStreamFn: GenerateSpeechStreamFn;
  speechVoice?: string;
  isSpeechModelEnabled: boolean;
  speechOnly: boolean;
}) {
  const { isAtLeast } = useBreakpoints();
  const tCommon = useTranslations('common');
  const [isTextVisible, setIsTextVisible] = useState(false);

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
    activitySteps.length > 0 && !showActivityDialog ? (
      <AiActivityPanel steps={activitySteps} panelId={`assistant-ai-activity-${message.id}`} />
    ) : null;

  const margin =
    allFiles !== undefined || userWebSources.length > 0 || AiActivity !== null ? 'm-0 mt-4' : 'm-4';

  // Short description instead of the raw plot JSON for copy, read-aloud and audio.
  const plainText = useMemo(
    () =>
      replacePlotBlocks(message.content, (title) =>
        title ? tCommon('plot.description', { title }) : tCommon('plot.label'),
      ),
    [message.content, tCommon],
  );

  const isAssistantSpeechOnly = message.role === 'assistant' && speechOnly && isSpeechModelEnabled;
  const isInitialMessage = message.id === 'initial-message';
  const actionsVisible = message.role === 'assistant' && (!isLastNonUser || status !== 'streaming');

  // The player is shown immediately in speech-only mode; otherwise it stays hidden until the user
  // reveals it via `ShowAudioPlayerButton`.
  const [showAudioPlayer, setShowAudioPlayer] = useState(isAssistantSpeechOnly);

  // Starts playback automatically once the current (last) assistant message has just finished
  // streaming. Uses a counter bumped exactly once per streaming-to-ready transition, so historical
  // messages that are already complete when the page loads never auto-play.
  const [autoPlayTrigger, setAutoPlayTrigger] = useState(0);
  const previousStatusRef = useRef(status);
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;
    if (
      isAssistantSpeechOnly &&
      isLastNonUser &&
      previousStatus === 'streaming' &&
      status !== 'streaming'
    ) {
      setAutoPlayTrigger((trigger) => trigger + 1);
    }
  }, [status, isAssistantSpeechOnly, isLastNonUser]);

  const maybeShowMessageIcons = actionsVisible ? (
    <MessageActions
      message={message}
      plainText={plainText}
      status={status}
      conversationId={conversationId}
      characterName={characterName}
      regenerateMessage={regenerateMessage}
      canRegenerateMessage={canRegenerateMessage}
      isSpeechModelEnabled={isSpeechModelEnabled}
      showActivityDialog={showActivityDialog}
      activitySteps={activitySteps}
      isLastMessage={isLastNonUser}
      speechOnly={isAssistantSpeechOnly}
      isInitialMessage={isInitialMessage}
      isTextVisible={isTextVisible}
      onToggleText={() => setIsTextVisible((visible) => !visible)}
      showAudioPlayer={showAudioPlayer}
      onToggleAudioPlayer={() => setShowAudioPlayer((visible) => !visible)}
    />
  ) : null;

  const maybeAudioPlayer =
    message.role === 'assistant' ? (
      <AudioPlayer
        key={speechVoice ?? ''}
        isSpeechModelEnabled={isSpeechModelEnabled}
        text={plainText}
        isInitialMessage={isInitialMessage}
        generateSpeechStreamFn={generateSpeechStreamFn}
        hidden={!showAudioPlayer}
        autoPlayTrigger={autoPlayTrigger}
        className="w-full"
      />
    ) : null;

  const showMessageText = !isAssistantSpeechOnly || isTextVisible;

  const messageContent = (
    <PlotStreamingContext.Provider value={status === 'streaming' && isLastNonUser}>
      <MarkdownDisplay>{message.content}</MarkdownDisplay>
    </PlotStreamingContext.Provider>
  );

  return (
    <>
      {AiActivity}
      {/* Hover surface for the message actions revealed by MessageActions. */}
      <div key={index} className={cn('w-full group/message', userClassName, margin)}>
        <div aria-label={`${message.role} message ${Math.floor(index / 2 + 1)}`}>
          <div className={cn('flex min-w-0', isAtLeast.sm ? 'flex-row' : 'flex-col')}>
            {message.role === 'assistant' && assistantIcon}
            <div
              className={cn(
                'flex flex-col items-start gap-2',
                message.role === 'assistant' && 'w-full min-w-0',
              )}
            >
              {showMessageText && messageContent}
              {maybeAudioPlayer}
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
