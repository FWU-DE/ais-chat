import type { UserAndContext } from '@/auth/types';
import type { AiActivityToolStep } from '@/types/ai-activity';
import { type ToolDefinition, type ToolRegistry, type ToolRegistryEntry } from '@ais-chat/ai-core';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import type { FileModel, WebSearchModel } from '@shared/db/schema';
import type { CalculatorResponse } from '../calculator';
import type { MundoSearchResult } from '../mundo-search';

export type { ToolDefinition, ToolRegistry };

export type WebSearchToolResult = {
  title: string | null;
  url: string | null;
  content: string | null;
};

export type WebSearchToolResponse = {
  results: WebSearchToolResult[];
  error: string | null;
};

export type MundoSearchToolResponse = {
  results: MundoSearchResult[];
  retriedWithoutFilters: boolean;
  error: string | null;
};

export type RetrieveEntireFileToolResponse = {
  fileName: string | null;
  content: string | null;
  truncated: boolean;
  characterCount: number;
  maxCharacters: number;
  error: string | null;
};

export type SemanticFileSearchToolResponse = {
  chunks: Array<{
    fileName: string | null;
    orderIndex: number | null;
    content: string | null;
  }>;
  error: string | null;
};

export type WebScraperToolResult = {
  title: string | null;
  url: string | null;
  content: string | null;
  error: string | null;
};

export type ToolResult =
  | CalculatorResponse
  | WebSearchToolResponse
  | MundoSearchToolResponse
  | RetrieveEntireFileToolResponse
  | SemanticFileSearchToolResponse
  | WebScraperToolResult[]
  | string;

type ToolActivity<TResult extends ToolResult> = {
  createStep: (toolCall: ToolCall) => AiActivityToolStep;
  applyResult?(step: AiActivityToolStep, result: TResult): AiActivityToolStep;
};

export type ToolRegistration<TResult extends ToolResult> = ToolRegistryEntry<TResult> & {
  activity: ToolActivity<TResult>;
};

export type GenericToolRegistration = ToolRegistryEntry<ToolResult> & {
  activity: ToolActivity<ToolResult>;
};

export function generalizeToolRegistration<TResult extends ToolResult>(
  registration: ToolRegistration<TResult>,
): GenericToolRegistration {
  const { applyResult, ...activity } = registration.activity;

  return {
    ...registration,
    activity: {
      ...activity,
      applyResult:
        applyResult === undefined
          ? undefined
          : (step, result) => applyResult(step, result as TResult),
    },
  };
}

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
