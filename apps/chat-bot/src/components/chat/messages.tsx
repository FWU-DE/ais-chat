import type { AiActivityStep } from '@/types/ai-activity';
import { type ChatStatus, type GenerateSpeechFn, type UIMessage } from '@/types/chat';
import { FileModel } from '@shared/db/schema';
import { WebSource } from '@shared/db/types';
import { ChatBox, type PendingFileModel } from './chat-box';
import LoadingAnimation from './loading-animation';
import { AudioPlaybackCoordinatorProvider } from './speech/audio-playback-coordinator';
import { GenerateSpeechStreamFn } from './speech/types';

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
  generateSpeechFn: GenerateSpeechFn;
  generateSpeechStreamFn: GenerateSpeechStreamFn;
  speechVoice?: string;
  isSpeechModelEnabled: boolean;
  speechOnly: boolean;
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
  generateSpeechStreamFn,
  speechVoice,
  isSpeechModelEnabled,
  speechOnly,
}: MessagesProps): React.JSX.Element {
  const canRegenerateMessage = messages.some((message) => message.role === 'user');
  const lastMessage = messages[messages.length - 1];
  // Keep the loading animation visible until the assistant actually starts emitting text,
  // even once the message placeholder exists for early activity steps (status: 'streaming').
  const showLoadingAnimation =
    isLoading ||
    (status === 'streaming' && lastMessage?.role === 'assistant' && lastMessage.content === '');

  return (
    <div className={containerClassName}>
      <AudioPlaybackCoordinatorProvider>
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
            canRegenerateMessage={canRegenerateMessage}
            conversationId={conversationId}
            assistantIcon={assistantIcon}
            webSources={message.role === 'user' ? webSourceMapping?.get(message.id) : undefined}
            status={status}
            showActivityDialog={showActivityDialog}
            generateSpeechFn={generateSpeechFn}
            generateSpeechStreamFn={generateSpeechStreamFn}
            speechVoice={speechVoice}
            isSpeechModelEnabled={isSpeechModelEnabled}
            speechOnly={speechOnly}
          />
        ))}
      </AudioPlaybackCoordinatorProvider>
      {showLoadingAnimation && <LoadingAnimation activitySteps={activitySteps} />}
    </div>
  );
}
