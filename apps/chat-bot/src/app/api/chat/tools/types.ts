import type { UserAndContext } from '@/auth/types';
import { AiActivityToolStep } from '@/types/ai-activity';
import {
  ToolCall,
  ToolRegistryEntry,
  type ToolDefinition,
  type ToolResult,
} from '@ais-chat/ai-core';
import type { FileModel, WebSearchModel } from '@shared/db/schema';
import type { buildTools } from '../build-tools';

export type { ToolDefinition };

export type ToolRegistration<TResult extends ToolResult = ToolResult> =
  ToolRegistryEntry<TResult> & {
    activity: {
      createStep: (toolCall: ToolCall) => AiActivityToolStep;
      applyResult?: (step: AiActivityToolStep, result: unknown) => AiActivityToolStep;
    };
  };

export type ToolRegistry = Awaited<ReturnType<typeof buildTools>>['toolRegistry'];

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
