// reexport types from ./shared-chat-types.ts
export type {
  SharedChatCharacter,
  SharedChatEntity,
  SharedChatFileMetadata,
  SharedChatLearningScenario,
  SharedSessionId,
} from '@shared/shared-chat/shared-chat-types';

// reexport guards from ./shared-chat-types.ts
export { isSharedChatFileMetadata } from '@shared/shared-chat/shared-chat-types';

// export verification helper
export { verify } from '@shared/shared-chat';
