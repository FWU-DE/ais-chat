import { type AiActivityStep } from '@/types/ai-activity';
import { type ChatStatus, type UIMessage } from '@/types/chat';
import { cn } from '@/utils/tailwind';
import { TextTIcon, TextTSlashIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import CopyToClipboardButton from '../common/clipboard-button';
import ReloadIcon from '../icons/reload';
import { AiActivityDialog } from './activity/ai-activity';
import DownloadConversationMessageButton from './download-conversation-message-button';
import SpeechButton from './speech-button';

export function MessageActions({
  message,
  plainText,
  status,
  conversationId,
  characterName,
  regenerateMessage,
  canRegenerateMessage,
  generateSpeechFn,
  isSpeechModelEnabled,
  showActivityDialog,
  activitySteps,
  isLastMessage,
  speechOnly,
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
  isSpeechModelEnabled: boolean;
  showActivityDialog?: boolean;
  activitySteps: AiActivityStep[];
  isLastMessage: boolean;
  speechOnly: boolean;
  isTextVisible: boolean;
  onToggleText: () => void;
}) {
  const tCommon = useTranslations('common');

  return (
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
        message.id !== 'initial-message' &&
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
          aria-label={tCommon('regenerate-message-button-aria-label')}
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
      {showActivityDialog && <AiActivityDialog steps={activitySteps} />}
    </div>
  );
}
