'use client';

import { AssistantSelectModel } from '@shared/db/schema';
import { ConversationMessageMetadata } from '@shared/utils/chat';

export type SendMessageProps = {
  className?: string;
  disabled?: boolean;
  chatDisabled?: boolean;
  onSubmit: (data: {
    message: string;
    metadata: ConversationMessageMetadata | null;
  }) => Promise<void>;
  onFocus?: () => void;
  onButtonClickWhenChatDisabled?(): void;
  assistantName: string | undefined;
  stopResponseGeneration?: () => void;
  messages: string[];
  assistant?: AssistantSelectModel;
  hideStartMessages?: boolean;
};
