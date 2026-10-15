import {
  MUNDO_CLASS_LEVELS,
  MUNDO_SEARCH_QUERY_LENGTH_LIMIT,
  MUNDO_SEARCH_RESULTS_LIMIT,
  MUNDO_SUBJECTS,
} from '@/configuration-text-inputs/const';
import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord, toLinks } from '@/utils/chat/ai-activity';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { z } from 'zod';
import {
  mundoSearch,
  MundoSearchResult,
  sanitizeClassLevel,
  sanitizeSubject,
} from '../mundo-search';
import type { ToolDefinition, ToolRegistration } from './types';

export const mundoSearchArgsSchema = z.object({
  query: z.string().trim().min(1),
  classLevel: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
});

export type MundoSearchToolResponse = {
  results: MundoSearchResult[];
  retriedWithoutFilters: boolean;
};

export function buildMundoSearchTool(): ToolRegistration {
  const definition: ToolDefinition = {
    name: TOOL_NAMES.mundoSearch,
    description: `Search the public MUNDO educational media library (mundo.schule) for teaching materials, e.g. videos or worksheets. Use this tool when the user asks for lesson materials or media suggestions for a specific topic. Returns up to ${MUNDO_SEARCH_RESULTS_LIMIT} matching MUNDO media entries. If a search with filters returns nothing, filters are automatically dropped and the search is retried. When the response has "retriedWithoutFilters": true, do not retry with different filters — instead retry with a broader, simpler or alternative query, without any filters.`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'A concise search query in German describing the topic (max 2 words). Examples: "Photosynthese", "Bruchrechnung", "Weimarer Republik".',
        },
        // anyOf instead of `type: ['string', 'null']` + enum: Anthropic rejects enums on a
        // multi-type field, while anyOf is accepted by both OpenAI and Anthropic.
        classLevel: {
          description:
            'Optional class level range to filter results. Only set this when the teacher explicitly mentioned the class. Pick the single range that best matches. If the teacher did not specify a target class, pass null so no filter is applied.',
          anyOf: [{ type: 'string', enum: [...MUNDO_CLASS_LEVELS] }, { type: 'null' }],
        },
        subject: {
          description:
            'Optional school subject to filter results. Pick exactly one subject that best matches the topic of the query. If no subject clearly fits, pass null so no filter is applied.',
          anyOf: [{ type: 'string', enum: [...MUNDO_SUBJECTS] }, { type: 'null' }],
        },
      },
      required: ['query', 'classLevel', 'subject'],
      additionalProperties: false,
    },
  };

  const handler = async (
    args: Record<string, unknown>,
  ): Promise<MundoSearchToolResponse | { error: string }> => {
    const parsed = mundoSearchArgsSchema.safeParse(args);

    if (!parsed.success) {
      return { error: 'Invalid search query or filters.' };
    }

    const query = parsed.data.query.slice(0, MUNDO_SEARCH_QUERY_LENGTH_LIMIT);

    const classLevel = sanitizeClassLevel(parsed.data.classLevel);
    const subject = sanitizeSubject(parsed.data.subject);
    const hasFilters = classLevel !== undefined || subject !== undefined;

    try {
      let results = await mundoSearch({ query, classLevel, subject });
      let retriedWithoutFilters = false;

      if (results.length === 0 && hasFilters) {
        results = await mundoSearch({ query });
        retriedWithoutFilters = true;
      }

      return {
        results,
        retriedWithoutFilters,
      };
    } catch {
      return { error: 'MUNDO search failed.' };
    }
  };

  return {
    definition,
    handler,
    activity: {
      createStep: (toolCall: ToolCall) => {
        const parsed = mundoSearchArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));
        return {
          kind: 'tool',
          id: toolCall.id,
          tool: TOOL_NAMES.mundoSearch,
          detail: parsed.success ? parsed.data.query : undefined,
        };
      },
      applyResult: (step, result) => {
        const typed = result as MundoSearchToolResponse;
        const links = toLinks(typed.results);

        return links === undefined ? step : { ...step, links };
      },
    },
  };
}
