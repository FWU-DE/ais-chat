import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord, toLinks } from '@/utils/chat/ai-activity';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { z } from 'zod';
import { resolveWebSearchConfig, searchWeb } from '../websearch';
import type { BuildToolsContext, ToolDefinition, ToolRegistration } from './types';

export const webSearchArgsSchema = z.object({
  query: z.string().trim().min(1),
});

export type WebSearchToolResult = {
  title: string | null;
  url: string | null;
  content: string | null;
};

export type WebSearchToolResponse = {
  results: WebSearchToolResult[];
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

export function buildWebSearchTool({
  user,
  characterId,
  learningScenarioId,
  assistantId,
  conversationId,
  webSearchSettings,
}: BuildWebSearchToolParams): ToolRegistration | null {
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

  const handler = async (
    args: Record<string, unknown>,
  ): Promise<WebSearchToolResponse | { error: string }> => {
    const parsed = webSearchArgsSchema.safeParse(args);

    if (!parsed.success) {
      return { error: 'Missing search query.' };
    }

    try {
      const results = await searchWeb({
        query: parsed.data.query,
        conversationId,
        characterId,
        learningScenarioId,
        userId: user.id,
        includedDomains,
      });

      return {
        results: results.map((result) => ({
          title: result.name?.trim() ?? null,
          url: result.url ?? null,
          content: result.content?.trim() ?? null,
        })),
      };
    } catch {
      return { error: 'Web search failed.' };
    }
  };

  return {
    definition,
    handler,
    activity: {
      createStep: (toolCall: ToolCall) => {
        const parsed = webSearchArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));
        return {
          kind: 'tool',
          id: toolCall.id,
          tool: TOOL_NAMES.webSearch,
          detail: parsed.success ? parsed.data.query : undefined,
        };
      },
      applyResult: (step, result) => {
        const typed = result as WebSearchToolResponse;
        const links = toLinks(typed.results);
        return links === undefined ? step : { ...step, links };
      },
    },
  };
}
