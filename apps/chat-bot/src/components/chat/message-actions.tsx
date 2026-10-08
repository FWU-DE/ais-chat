import { type AiActivityStep } from '@/types/ai-activity';
import { type ChatStatus, type UIMessage } from '@/types/chat';
import { cn } from '@/utils/tailwind';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import CopyToClipboardButton from '../common/clipboard-button';
import ReloadIcon from '../icons/reload';
import { AiActivityDialog } from './activity/ai-activity';
import DownloadConversationMessageButton from './download-conversation-message-button';
import SpeechButton from './speech-button';

export function MessageActions({
  message,
  status,
  conversationId,
  characterName,
  regenerateMessage,
  generateSpeechFn,
  isSpeechModelEnabled,
  showActivityDialog,
  activitySteps,
  isLastMessage,
  className,
}: {
  message: UIMessage;
  status: ChatStatus;
  conversationId?: string;
  characterName?: string;
  regenerateMessage: () => void;
  generateSpeechFn: (text: string) => Promise<Blob>;
  isSpeechModelEnabled: boolean;
  showActivityDialog?: boolean;
  activitySteps: AiActivityStep[];
  isLastMessage: boolean;
  className?: string;
}) {
  const tCommon = useTranslations('common');

  return (
    <div className={cn('flex items-center gap-1 mt-1', className)}>
      <CopyToClipboardButton
        text={message.content}
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
      {isLastMessage && (
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          title={tCommon('regenerate-message')}
          onClick={() => regenerateMessage()}
          aria-label="Reload"
          className="text-primary"
        >
          <ReloadIcon className="size-5 text-primary" />
        </Button>
      )}
      <SpeechButton
        text={message.content}
        generateSpeechFn={generateSpeechFn}
        isSpeechModelEnabled={isSpeechModelEnabled}
      />
      {showActivityDialog && <AiActivityDialog steps={activitySteps} />}
    </div>
  );
}
