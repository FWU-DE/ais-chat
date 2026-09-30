import type { AiActivityStep } from '@/types/ai-activity';
import { type ChatStatus, type UIMessage } from '@/types/chat';
import { FileModel } from '@shared/db/schema';
import { WebSource } from '@shared/db/types';
import { AiActivityPanel } from './activity/ai-activity';
import { ChatBox, type PendingFileModel } from './chat-box';
import LoadingAnimation from './loading-animation';

// Re-export for consumers that import from this file
export type { ChatStatus, PendingFileModel };

interface MessagesProps {
  messages: UIMessage[];
  isLoading: boolean;
  status: ChatStatus;
  reload: () => void;
  conversationId?: string;
  assistantIcon?: React.ReactNode;
  containerClassName: string;
  fileMapping?: Map<string, FileModel[]>;
  pendingFileMapping?: Map<string, PendingFileModel[]>;
  webSourceMapping?: Map<string, WebSource[]>;
  activitySteps?: AiActivityStep[];
  showActivityDialog?: boolean;
  generateSpeechFn: (text: string) => Promise<Blob>;
  isSpeechModelEnabled: boolean;
  hideFileName?: boolean;
}

export function Messages({
  messages,
  isLoading,
  status,
  reload,
  conversationId,
  assistantIcon,
  containerClassName,
  fileMapping,
  pendingFileMapping,
  webSourceMapping,
  activitySteps = [],
  showActivityDialog = false,
  generateSpeechFn,
  isSpeechModelEnabled,
  hideFileName = false,
}: MessagesProps): React.JSX.Element {
  return (
    <div className={containerClassName}>
      {messages.map((message, index) => (
        <ChatBox
          key={index}
          index={index}
          message={message}
          fileMapping={fileMapping}
          pendingFileMapping={pendingFileMapping}
          isLastNonUser={index === messages.length - 1 && message.role !== 'user'}
          isLoading={isLoading}
          regenerateMessage={reload}
          conversationId={conversationId}
          assistantIcon={assistantIcon}
          webSources={message.role === 'user' ? webSourceMapping?.get(message.id) : undefined}
          status={status}
          showActivityDialog={showActivityDialog}
          generateSpeechFn={generateSpeechFn}
          isSpeechModelEnabled={isSpeechModelEnabled}
          hideFileName={hideFileName}
        />
      ))}
      {isLoading && <LoadingAnimation activitySteps={activitySteps} />}
      {isLoading && !showActivityDialog && activitySteps.length > 0 && (
        <AiActivityPanel
          steps={activitySteps}
          panelId="live-ai-activity"
          hideFileName={hideFileName}
        />
      )}
    </div>
  );
}
