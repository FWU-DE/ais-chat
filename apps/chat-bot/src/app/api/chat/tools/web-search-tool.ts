import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord, readValue, toLinks } from '@/utils/chat/ai-activity';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { z } from 'zod';
import { resolveWebSearchConfig, searchWeb } from '../websearch';
import type { BuildToolsContext, ToolActivity, ToolDefinition, ToolRegistration } from './types';

export const webSearchArgsSchema = z.object({
  query: z.string(),
});

export type WebSearchToolResult = {
  title: string | null;
  url: string | null;
  content: string | null;
};

export type WebSearchToolResponse = {
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
>;

export const webSearchActivity: ToolActivity = {
  createStep: (toolCall: ToolCall) => {
    const parsed = webSearchArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));
    return {
      kind: 'tool',
      id: toolCall.id,
      tool: TOOL_NAMES.webSearch,
      detail: parsed.success ? parsed.data.query.trim() : undefined,
    };
  },
  applyResult: (step, result) => {
    const links = toLinks(readValue(result, 'results'));
    return links === undefined ? step : { ...step, links };
  },
};

export async function buildWebSearchTool({
  user,
  characterId,
  learningScenarioId,
  assistantId,
  conversationId,
  webSearchSettings,
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
    name: TOOL_NAMES.webSearch,
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
    const parsed = webSearchArgsSchema.safeParse(args);
    const query = parsed.success ? parsed.data.query : '';
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

    if (results.length === 0) {
      response.error = 'No results found.';
      return response;
    }

    return response;
  };

  return {
    definition,
    handler,
    activity: webSearchActivity,
  };
}
