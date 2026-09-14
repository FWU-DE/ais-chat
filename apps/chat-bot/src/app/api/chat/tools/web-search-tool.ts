import type { WebSearchResult } from '@shared/db/schema';
import { resolveWebSearchConfig, searchWeb } from '../websearch';
import type { BuildToolsContext, ToolDefinition, ToolRegistration } from './types';

type WebSearchToolResult = {
  title: string | null;
  url: string | null;
  content: string | null;
};

type WebSearchToolResponse = {
  results: WebSearchToolResult[];
  error: string | null;
};

type BuildWebSearchToolParams = Pick<
  BuildToolsContext,
  | 'user'
  | 'characterId'
  | 'learningScenarioId'
  | 'assistantId'
  | 'conversationId'
  | 'webSearchSettings'
> & {
  onWebSearchResults?: (results: WebSearchResult[]) => void;
};

export async function buildWebSearchTool({
  user,
  characterId,
  learningScenarioId,
  assistantId,
  conversationId,
  webSearchSettings,
  onWebSearchResults,
}: BuildWebSearchToolParams): Promise<ToolRegistration | null> {
  const config = resolveWebSearchConfig({
    user,
    assistantId,
    webSearchSettings,
  });

  if (!config.enabled) {
    return null;
  }

  const includedDomains = config.scope === 'included-domains' ? config.includedDomains : undefined;

  const baseDescription =
    "Search the web for current information such as recent events, news, or facts that may have changed after the model's knowledge cutoff (weather, prices, scores, etc.). Returns a list of result snippets with titles and URLs.";

  const description =
    includedDomains && includedDomains.length > 0
      ? `${baseDescription} Results are restricted to the following domains: ${includedDomains.join(', ')}.`
      : baseDescription;

  const definition: ToolDefinition = {
    name: 'web_search',
    description,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'A concise search query (max 10 words) that captures the key information need. Write it in the same language as the user.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  };

  const handler = async (args: Record<string, unknown>) => {
    const query = typeof args.query === 'string' ? args.query : '';
    const results = await searchWeb({
      query,
      conversationId,
      characterId,
      learningScenarioId,
      userId: user.id,
      includedDomains,
    });

    const response: WebSearchToolResponse = {
      results: results.map((result) => ({
        title: result.name?.trim() ?? null,
        url: result.url ?? null,
        content: result.content?.trim() ?? null,
      })),
      error: null,
    };

    onWebSearchResults?.(results);

    if (results.length === 0) {
      response.error = 'No results found.';
      return JSON.stringify(response);
    }

    return JSON.stringify(response);
  };

  return { definition, handler };
}
