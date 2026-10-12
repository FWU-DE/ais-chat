import type { UserAndContext } from '@/auth/types';
import { AiActivityToolStep } from '@/types/ai-activity';
import { ToolCall, ToolRegistryEntry, type ToolDefinition } from '@ais-chat/ai-core';
import type { FileModel, WebSearchModel } from '@shared/db/schema';

export type { ToolDefinition };

export type ToolRegistration = ToolRegistryEntry & {
  activity: {
    createStep: (toolCall: ToolCall) => AiActivityToolStep;
    applyResult?: (step: AiActivityToolStep, result: unknown) => AiActivityToolStep;
  };
};

export type ToolRegistry = Record<string, ToolRegistration>;

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
