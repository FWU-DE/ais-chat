import type { UserAndContext } from '@/auth/types';
import { TOOL_NAMES } from '@/types/tool-names';
import type { ModelSelection } from '@ais-chat/ai-core/chat/types';
import type { FileModel, WebSearchModel } from '@shared/db/schema';
import { buildJsxgraphTool } from './tools/jsxgraph-tool';
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
  modelSelection: ModelSelection;
  apiKeyId: string;
};

export function buildTools({
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
  modelSelection,
  apiKeyId,
}: BuildToolsParams) {
  const mathCalculateTool = user.federalState.featureToggles.isCalculatorEnabled
    ? buildMathCalculateTool()
    : undefined;
  const jsxgraphTool = user.federalState.featureToggles.isJsxGraphEnabled
    ? buildJsxgraphTool({ modelSelection, apiKeyId })
    : undefined;
  const webSearchTool = allowWebTools
    ? buildWebSearchTool({
        user,
        characterId,
        learningScenarioId,
        assistantId,
        conversationId,
        webSearchSettings,
      })
    : undefined;
  const webScraperTool = allowWebTools
    ? buildWebScraperTool({ sourceUrls, attachedLinks })
    : undefined;
  const mundoSearchTool = allowMundoSearch ? buildMundoSearchTool() : undefined;
  const retrieveEntireFileTool = buildRetrieveEntireFileTool({ relatedFileEntities });
  const retrieveTextChunksTool = buildRetrieveTextChunksTool({
    user,
    relatedFileEntities,
    sourceUrls,
    attachedLinks,
  });

  // Each tool is built into its own named const and merged via conditional spread (instead of one
  // object with possibly-undefined values filtered afterwards), so TypeScript can drop disabled
  // tools and still infer each key's specific ToolRegistration<T> without a type assertion.
  const toolRegistry = {
    ...(mathCalculateTool && { [TOOL_NAMES.mathCalculate]: mathCalculateTool }),
    ...(jsxgraphTool && { [TOOL_NAMES.createPlot]: jsxgraphTool }),
    ...(webSearchTool && { [TOOL_NAMES.webSearch]: webSearchTool }),
    ...(webScraperTool && { [TOOL_NAMES.webScraper]: webScraperTool }),
    ...(mundoSearchTool && { [TOOL_NAMES.mundoSearch]: mundoSearchTool }),
    ...(retrieveEntireFileTool && { [TOOL_NAMES.retrieveEntireFile]: retrieveEntireFileTool }),
    ...(retrieveTextChunksTool && { [TOOL_NAMES.retrieveTextChunks]: retrieveTextChunksTool }),
  };

  return { toolRegistry };
}
