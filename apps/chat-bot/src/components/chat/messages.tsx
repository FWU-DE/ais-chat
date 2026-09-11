import { type UIMessage, type ChatStatus } from '@/types/chat';
import { ChatBox, type PendingFileModel } from './chat-box';
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
  /** Activity of the generation that is currently running, shown next to the loading animation. */
  activitySteps?: AiActivityStep[];
  showActivityInDialog?: boolean;
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
  activitySteps,
  showActivityInDialog,
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
          showActivityInDialog={showActivityInDialog}
        >
          {message}
        </ChatBox>
      ))}

      {isLoading && <LoadingAnimation activitySteps={activitySteps} />}
    </div>
  );
}
