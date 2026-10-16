import type { UserAndContext } from '@/auth/types';
import { AiActivityToolStep } from '@/types/ai-activity';
import {
  ToolCall,
  ToolRegistryEntry,
  type ToolDefinition,
  type ToolResult,
} from '@ais-chat/ai-core';
import type { ToolErrorResult } from '@ais-chat/ai-core/chat/types';
import type { FileModel, WebSearchModel } from '@shared/db/schema';
import type { buildTools } from '../build-tools';

export type { ToolDefinition };

/**
 * Independent of `ToolRegistryEntry` (definition/handler): a tool's activity only turns its own
 * call/result into an `AiActivityToolStep` and never depends on runtime build params, so it can be
 * built once per tool and reused wherever activity is reconstructed (live streaming or DB reload).
 */
export type ToolActivity<TResult extends ToolResult = ToolResult> = {
  createStep: (toolCall: ToolCall) => AiActivityToolStep;
  /**
   * Method shorthand (not an arrow-typed property): TS checks it bivariantly, letting each
   * tool type `result` precisely here without casts, while staying callable generically below.
   * Note: this is effectively a cast in disguise.
   */
  applyResult?(step: AiActivityToolStep, result: TResult): AiActivityToolStep;
  /**
   * Normalizes a persisted (DB-stored) tool result's raw JSON value into the current result
   * shape, including any legacy shapes this tool used to persist. The returned value is fed
   * straight into `applyResult`, so parsing only needs to produce whatever `applyResult` actually
   * reads, not a fully faithful reconstruction of the original result. If the returned object has
   * an `error` property, it's treated as a `ToolErrorResult` and `applyResult` is skipped.
   * Required so every tool makes an explicit decision here, even if that is just delegating to
   * `parseGenericPersistedToolResult` for error detection.
   */
  parsePersistedResult(raw: unknown): TResult | ToolErrorResult | undefined;
};

export type ToolRegistration<TResult extends ToolResult = ToolResult> =
  ToolRegistryEntry<TResult> & {
    activity: ToolActivity<TResult>;
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
