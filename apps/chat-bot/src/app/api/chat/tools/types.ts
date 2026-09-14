import { type ToolDefinition, type ToolRegistry } from '@ais-chat/ai-core';
import type { UserAndContext } from '@/auth/types';
import type { FileModel, WebSearchModel, WebSearchResult } from '@shared/db/schema';

export type { ToolDefinition, ToolRegistry };

export type ToolRegistration = {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>) => Promise<string>;
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
