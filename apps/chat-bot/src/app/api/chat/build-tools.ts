import type { UserAndContext } from '@/auth/types';
import { TOOL_NAMES } from '@/types/tool-names';
import { FileModel, WebSearchModel } from '@shared/db/schema';
import { buildMathCalculateTool, mathCalculateActivity } from './tools/math-calculate-tool';
import { buildMundoSearchTool, mundoSearchActivity } from './tools/mundo-search-tool';
import {
  buildRetrieveEntireFileTool,
  retrieveEntireFileActivity,
} from './tools/retrieve-entire-file-tool';
import {
  buildRetrieveTextChunksTool,
  retrieveTextChunksActivity,
} from './tools/retrieve-text-chunks-tool';
import { buildWebScraperTool, webScraperActivity } from './tools/web-scraper-tool';
import { buildWebSearchTool, webSearchActivity } from './tools/web-search-tool';

// TODO make sure all tool names are in this toolActivities object
export const toolActivities = {
  [TOOL_NAMES.mathCalculate]: mathCalculateActivity,
  [TOOL_NAMES.mundoSearch]: mundoSearchActivity,
  [TOOL_NAMES.retrieveEntireFile]: retrieveEntireFileActivity,
  [TOOL_NAMES.retrieveTextChunks]: retrieveTextChunksActivity,
  [TOOL_NAMES.webScraper]: webScraperActivity,
  [TOOL_NAMES.webSearch]: webSearchActivity,
};

type BuildToolsParams = {
  user: UserAndContext;
  characterId?: string;
  learningScenarioId?: string;
  assistantId?: string;
  conversationId?: string;
  webSearchSettings?: WebSearchModel;
  relatedFileEntities: FileModel[];
  sourceUrls?: string[];
  attachedLinks?: string[];
  allowWebTools: boolean;
  allowMundoSearch?: boolean;
  isCalculatorEnabled?: boolean;
};

export async function buildTools({
  user,
  characterId,
  learningScenarioId,
  assistantId,
  conversationId,
  webSearchSettings,
  relatedFileEntities,
  sourceUrls = [],
  attachedLinks = [],
  allowWebTools,
  allowMundoSearch,
  isCalculatorEnabled = false,
}: BuildToolsParams) {
  const rawRegistry = {
    [TOOL_NAMES.mathCalculate]: isCalculatorEnabled ? buildMathCalculateTool() : undefined,
    [TOOL_NAMES.webSearch]: allowWebTools
      ? await buildWebSearchTool({
          user,
          characterId,
          learningScenarioId,
          assistantId,
          conversationId,
          webSearchSettings,
        })
      : undefined,
    [TOOL_NAMES.webScraper]: allowWebTools
      ? buildWebScraperTool({
          sourceUrls,
          attachedLinks,
        })
      : undefined,
    [TOOL_NAMES.mundoSearch]: allowMundoSearch ? buildMundoSearchTool() : undefined,
    [TOOL_NAMES.retrieveEntireFile]: buildRetrieveEntireFileTool({
      relatedFileEntities,
    }),
    [TOOL_NAMES.retrieveTextChunks]: buildRetrieveTextChunksTool({
      user,
      relatedFileEntities,
      sourceUrls,
      attachedLinks,
    }),
  } as const;

  // Tools that are disabled or returned null must be omitted, not kept as undefined entries.
  const toolRegistry = Object.fromEntries(
    Object.entries(rawRegistry).filter(
      (entry): entry is [string, NonNullable<(typeof rawRegistry)[keyof typeof rawRegistry]>] =>
        entry[1] !== null && entry[1] !== undefined,
    ),
  );

  return { toolRegistry };
}

export type ToolRegistry = Awaited<ReturnType<typeof buildTools>>['toolRegistry'];
