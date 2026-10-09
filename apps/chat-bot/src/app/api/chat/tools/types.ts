import type { UserAndContext } from '@/auth/types';
import { AiActivityToolStep } from '@/types/ai-activity';
import { ToolCall, ToolRegistryEntry, type ToolDefinition } from '@ais-chat/ai-core';
import type { FileModel, WebSearchModel } from '@shared/db/schema';

export type { ToolDefinition };

export type ToolActivity<T> = {
  createStep: (toolCall: ToolCall) => AiActivityToolStep;
  applyResult?: (step: AiActivityToolStep, result: T) => AiActivityToolStep;
};

export type ToolRegistration<TName extends string, TResult> = ToolRegistryEntry<TName> & {
  activity: ToolActivity<TResult>;
};

export type BuildToolsContext = {
  user: UserAndContext;
  characterId?: string;
  learningScenarioId?: string;
  assistantId?: string;
  conversationId?: string;
  webSearchSettings?: WebSearchModel;
  relatedFileEntities: FileModel[];
  sourceUrls: string[];
  attachedLinks: string[];
};
