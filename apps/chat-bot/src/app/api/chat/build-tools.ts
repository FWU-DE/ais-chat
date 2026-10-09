import type { UserAndContext } from '@/auth/types';
import { TOOL_NAMES } from '@/types/tool-names';
import type { FileModel, WebSearchModel } from '@shared/db/schema';
import { buildMathCalculateTool } from './tools/math-calculate-tool';
import { buildMundoSearchTool } from './tools/mundo-search-tool';
import { buildRetrieveEntireFileTool } from './tools/retrieve-entire-file-tool';
import { buildRetrieveTextChunksTool } from './tools/retrieve-text-chunks-tool';
import { buildWebScraperTool } from './tools/web-scraper-tool';
import { buildWebSearchTool } from './tools/web-search-tool';

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
  };

  // Tools that are disabled or returned null must be omitted, not kept as undefined entries.
  const toolRegistry = Object.fromEntries(
    Object.entries(rawRegistry).filter(
      ([, registration]) => registration !== null && registration !== undefined,
    ),
  );

  return { toolRegistry };
}
