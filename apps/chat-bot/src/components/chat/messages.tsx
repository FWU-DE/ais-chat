import { type UIMessage, type ChatStatus } from '@/types/chat';
import { ChatBox, type PendingFileModel } from './chat-box';
import { AiActivityPanel } from './activity/ai-activity';
import LoadingAnimation from './loading-animation';
import { FileModel } from '@shared/db/schema';
import { WebSource } from '@shared/db/types';
import type { AiActivityStep } from '@/types/ai-activity';

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
}: MessagesProps) {
  return (
    <div className={containerClassName}>
      {messages.map((message, index) => (
        <ChatBox
          key={index}
          index={index}
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
        >
          {message}
        </ChatBox>
      ))}
      {isLoading && <LoadingAnimation activitySteps={activitySteps} />}
      {isLoading && !showActivityDialog && activitySteps.length > 0 && (
        <AiActivityPanel steps={activitySteps} panelId="live-ai-activity" />
      )}
    </div>
  );
}
