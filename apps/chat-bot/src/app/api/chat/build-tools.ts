import type { UserAndContext } from '@/auth/types';
import type { FileModel, WebSearchModel } from '@shared/db/schema';
import { buildMathCalculateTool } from './tools/math-calculate-tool';
import { buildMundoSearchTool } from './tools/mundo-search-tool';
import { buildRetrieveEntireFileTool } from './tools/retrieve-entire-file-tool';
import { buildRetrieveTextChunksTool } from './tools/retrieve-text-chunks-tool';
import {
  generalizeToolRegistration,
  type GenericToolRegistration,
  type ToolRegistration,
  type ToolResult,
} from './tools/types';
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

type BuildToolsResult = {
  toolRegistry: Record<string, GenericToolRegistration>;
};

function registerTool<TResult extends ToolResult>(
  registry: Record<string, GenericToolRegistration>,
  registration: ToolRegistration<TResult>,
) {
  registry[registration.definition.name] = generalizeToolRegistration(registration);
}

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
}: BuildToolsParams): Promise<BuildToolsResult> {
  const toolRegistry: Record<string, GenericToolRegistration> = {};

  if (isCalculatorEnabled) {
    registerTool(toolRegistry, buildMathCalculateTool());
  }

  if (allowWebTools) {
    const webSearchTool = await buildWebSearchTool({
      user,
      characterId,
      learningScenarioId,
      assistantId,
      conversationId,
      webSearchSettings,
    });

    if (webSearchTool) {
      registerTool(toolRegistry, webSearchTool);
    }
  }

  if (allowWebTools) {
    const webScraperTool = buildWebScraperTool({
      sourceUrls,
      attachedLinks,
    });

    if (webScraperTool) {
      registerTool(toolRegistry, webScraperTool);
    }
  }

  if (allowMundoSearch) {
    registerTool(toolRegistry, buildMundoSearchTool());
  }

  const retrieveEntireFileTool = buildRetrieveEntireFileTool({
    relatedFileEntities,
  });

  if (retrieveEntireFileTool) {
    registerTool(toolRegistry, retrieveEntireFileTool);
  }

  const retrieveTextChunksTool = buildRetrieveTextChunksTool({
    user,
    relatedFileEntities,
    sourceUrls,
    attachedLinks,
  });

  if (retrieveTextChunksTool) {
    registerTool(toolRegistry, retrieveTextChunksTool);
  }

  return { toolRegistry };
}
