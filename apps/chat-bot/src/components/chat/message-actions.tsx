import { type AiActivityStep } from '@/types/ai-activity';
import { type ChatStatus, type UIMessage } from '@/types/chat';
import { replacePlotBlocks } from '@/utils/code-blocks';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
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
}) {
  const tCommon = useTranslations('common');
  // Copy and read-aloud get a short description instead of the plot JSON.
  const plainText = useMemo(
    () =>
      replacePlotBlocks(message.content, (title) =>
        title ? tCommon('plot.description', { title }) : tCommon('plot.description-untitled'),
      ),
    [message.content, tCommon],
  );

  return (
    <div className="flex items-center gap-1 mt-1">
      <CopyToClipboardButton
        text={plainText}
        className="size-5"
        size="icon-sm"
        title={tCommon('message-copy')}
        aria-label={tCommon('message-copy')}
      />
      {status === 'ready' && conversationId !== undefined && message.id !== 'initial-message' && (
        <DownloadConversationMessageButton
          conversationId={conversationId}
          messageId={message.id}
          characterName={characterName}
        />
      )}
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
      <SpeechButton
        text={plainText}
        generateSpeechFn={generateSpeechFn}
        isSpeechModelEnabled={isSpeechModelEnabled}
      />
      {showActivityDialog && <AiActivityDialog steps={activitySteps} />}
    </div>
  );
}
