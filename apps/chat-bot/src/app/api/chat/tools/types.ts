import { type ToolDefinition, type ToolRegistry, type ToolRegistryEntry } from '@ais-chat/ai-core';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import type { UserAndContext } from '@/auth/types';
import type { AiActivityToolStep } from '@/types/ai-activity';
import type { FileModel, WebSearchModel, WebSearchResult } from '@shared/db/schema';

export type { ToolDefinition, ToolRegistry };

export type ToolRegistration = ToolRegistryEntry & {
  activity?: {
    createStep: (toolCall: ToolCall) => AiActivityToolStep;
    applyResult?: (step: AiActivityToolStep, result: string) => AiActivityToolStep;
  };
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
  onWebSearchResults?: (results: WebSearchResult[]) => void;
};
