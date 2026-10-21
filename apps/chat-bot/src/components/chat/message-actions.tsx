import { type AiActivityStep } from '@/types/ai-activity';
import { type ChatStatus, type UIMessage } from '@/types/chat';
import { cn } from '@/utils/tailwind';
import { TextTIcon, TextTSlashIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React from 'react';
import CopyToClipboardButton from '../common/clipboard-button';
import ReloadIcon from '../icons/reload';
import { AiActivityDialog } from './activity/ai-activity';
import DownloadConversationMessageButton from './download-conversation-message-button';
import AudioStreamPlayer from './speech/audio-stream-player';
import ShowAudioPlayerButton from './speech/show-audio-player-button';
import SpeechButton from './speech/speech-button';
import { GenerateSpeechStreamFn } from './speech/types';

export function MessageActions({
  message,
  plainText,
  status,
  conversationId,
  characterName,
  regenerateMessage,
  canRegenerateMessage,
  generateSpeechFn,
  generateSpeechStreamFn,
  isSpeechModelEnabled,
  showActivityDialog,
  activitySteps,
  isLastMessage,
  speechOnly,
  isInitialMessage,
  isTextVisible,
  onToggleText,
}: {
  message: UIMessage;
  plainText: string;
  status: ChatStatus;
  conversationId?: string;
  characterName?: string;
  regenerateMessage: () => void;
  canRegenerateMessage: boolean;
  generateSpeechFn: (text: string) => Promise<Blob>;
  generateSpeechStreamFn: GenerateSpeechStreamFn;
  isSpeechModelEnabled: boolean;
  showActivityDialog?: boolean;
  activitySteps: AiActivityStep[];
  isLastMessage: boolean;
  speechOnly: boolean;
  isInitialMessage: boolean;
  isTextVisible: boolean;
  onToggleText: () => void;
}) {
  const tCommon = useTranslations('common');

  const [showAudioPlayer, setShowAudioPlayer] = React.useState<boolean>(false);

  return (
    <div className="flex flex-col gap-4 w-full">
      <AudioStreamPlayer
        isSpeechModelEnabled={isSpeechModelEnabled}
        text={plainText}
        generateSpeechStreamFn={generateSpeechStreamFn}
        hidden={!showAudioPlayer}
      />
      <div
        className={cn(
          'flex items-center gap-1 mt-1',
          // Older messages reveal their actions on hover/focus of the surrounding `group/message`,
          // but stay visible on touch devices, where there is no hover.
          !isLastMessage &&
            'transition-opacity pointer-fine:opacity-0 pointer-fine:pointer-events-none pointer-fine:group-hover/message:opacity-100 pointer-fine:group-hover/message:pointer-events-auto pointer-fine:focus-within:opacity-100 pointer-fine:focus-within:pointer-events-auto',
        )}
      >
        <CopyToClipboardButton
          text={plainText}
          className="size-5"
          size="icon-sm"
          title={tCommon('message-copy')}
          aria-label={tCommon('message-copy')}
        />
        {conversationId !== undefined &&
          !isInitialMessage &&
          (!isLastMessage || status === 'ready') && (
            <DownloadConversationMessageButton
              conversationId={conversationId}
              messageId={message.id}
              characterName={characterName}
            />
          )}
        {isLastMessage && canRegenerateMessage && (
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            title={tCommon('regenerate-message-button')}
            onClick={() => regenerateMessage()}
            className="text-primary"
            data-testid="regenerate-message-button"
          >
            <ReloadIcon className="size-5 text-primary" />
          </Button>
        )}
        {speechOnly ? (
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={onToggleText}
            title={isTextVisible ? tCommon('hide-message-text') : tCommon('show-message-text')}
            aria-label={isTextVisible ? tCommon('hide-message-text') : tCommon('show-message-text')}
            aria-pressed={isTextVisible}
            className="text-primary"
            data-testid="toggle-message-text-button"
          >
            {isTextVisible ? (
              <TextTSlashIcon className="size-4 text-primary" />
            ) : (
              <TextTIcon className="size-4 text-primary" />
            )}
          </Button>
        ) : (
          <SpeechButton
            text={plainText}
            generateSpeechFn={generateSpeechFn}
            isSpeechModelEnabled={isSpeechModelEnabled}
          />
        )}
        <ShowAudioPlayerButton
          isSpeechModelEnabled={isSpeechModelEnabled}
          onShowPlayerChanged={(showPlayer) => setShowAudioPlayer(showPlayer)}
        />
        {showActivityDialog && <AiActivityDialog steps={activitySteps} />}
      </div>
    </div>
  );
}
