import type { ToolRegistry } from '@ais-chat/ai-core';
import type { UserAndContext } from '@/auth/types';
import type { FileModel, WebSearchModel, WebSearchResult } from '@shared/db/schema';
import { buildWebSearchTool } from './tools/web-search-tool';
import { buildWebScraperTool } from './tools/web-scraper-tool';
import { buildRetrieveEntireFileTool } from './tools/retrieve-entire-file-tool';
import { buildRetrieveTextChunksTool } from './tools/retrieve-text-chunks-tool';
import { buildMundoSearchTool } from './tools/mundo-search-tool';

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
  onWebSearchResults?: (results: WebSearchResult[]) => void;
};

type BuildToolsResult = {
  toolRegistry: ToolRegistry;
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
  onWebSearchResults,
}: BuildToolsParams): Promise<BuildToolsResult> {
  const toolRegistry: ToolRegistry = {};

  if (allowWebTools) {
    const webSearchTool = await buildWebSearchTool({
      user,
      characterId,
      learningScenarioId,
      assistantId,
      conversationId,
      webSearchSettings,
      onWebSearchResults,
    });

    if (webSearchTool) {
      toolRegistry[webSearchTool.definition.name] = webSearchTool;
    }
  }

  if (allowWebTools) {
    const webScraperTool = buildWebScraperTool({
      sourceUrls,
      attachedLinks,
    });

    if (webScraperTool) {
      toolRegistry[webScraperTool.definition.name] = webScraperTool;
    }
  }

  if (allowMundoSearch) {
    const mundoSearchTool = buildMundoSearchTool();
    toolRegistry[mundoSearchTool.definition.name] = mundoSearchTool;
  }

  const retrieveEntireFileTool = buildRetrieveEntireFileTool({
    relatedFileEntities,
  });

  if (retrieveEntireFileTool) {
    toolRegistry[retrieveEntireFileTool.definition.name] = retrieveEntireFileTool;
  }

  const retrieveTextChunksTool = buildRetrieveTextChunksTool({
    user,
    relatedFileEntities,
    sourceUrls,
    attachedLinks,
  });

  if (retrieveTextChunksTool) {
    toolRegistry[retrieveTextChunksTool.definition.name] = retrieveTextChunksTool;
  }

  return { toolRegistry };
}
