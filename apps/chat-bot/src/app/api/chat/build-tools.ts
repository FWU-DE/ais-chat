import type { UserAndContext } from '@/auth/types';
import type { AiActivityToolName } from '@/types/ai-activity';
import { TOOL_NAMES } from '@/types/tool-names';
import { isImageFile } from '@/utils/files/generic';
import type { ModelSelection } from '@ais-chat/ai-core/chat/types';
import type { FileModel, WebSearchModel } from '@shared/db/schema';
import { buildJsxgraphTool, createPlotActivity } from './tools/jsxgraph-tool';
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
import type { ToolActivity } from './tools/types';
import { buildWebScraperTool, webScraperActivity } from './tools/web-scraper-tool';
import { buildWebSearchTool, webSearchActivity } from './tools/web-search-tool';

/**
 * Static counterpart to the real `toolRegistry` below, reused to reconstruct activity (live
 * streaming or DB reload) without building the full tool set. `satisfies` ensures every tool is
 * present while keeping each entry's specific `ToolActivity<T>`.
 */
export const toolActivityRegistry = {
  [TOOL_NAMES.mathCalculate]: mathCalculateActivity,
  [TOOL_NAMES.createPlot]: createPlotActivity,
  [TOOL_NAMES.webSearch]: webSearchActivity,
  [TOOL_NAMES.webScraper]: webScraperActivity,
  [TOOL_NAMES.mundoSearch]: mundoSearchActivity,
  [TOOL_NAMES.retrieveEntireFile]: retrieveEntireFileActivity,
  [TOOL_NAMES.retrieveTextChunks]: retrieveTextChunksActivity,
} satisfies Record<AiActivityToolName, ToolActivity>;

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

  const textFileEntities = relatedFileEntities.filter((file) => !isImageFile(file.name));

  const retrieveEntireFileTool = buildRetrieveEntireFileTool({
    relatedFileEntities: textFileEntities,
  });
  const retrieveTextChunksTool = buildRetrieveTextChunksTool({
    user,
    relatedFileEntities: textFileEntities,
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
