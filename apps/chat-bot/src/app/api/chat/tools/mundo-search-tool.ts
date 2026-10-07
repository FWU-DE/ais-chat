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
import type { ToolActivity, ToolDefinition, ToolRegistration } from './types';

export const mundoSearchArgsSchema = z.object({
  query: z.string(),
  classLevel: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
});

export type MundoSearchToolResponse = {
  results: MundoSearchResult[];
  retriedWithoutFilters: boolean;
  error: string | null;
};

export const mundoSearchActivity: ToolActivity = {
  createStep: (toolCall: ToolCall) => {
    const parsed = mundoSearchArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));
    return {
      kind: 'tool',
      id: toolCall.id,
      tool: TOOL_NAMES.mundoSearch,
      detail: parsed.success ? parsed.data.query.trim() : undefined,
    };
  },
  applyResult: (step, result) => {
    const typed = result as MundoSearchToolResponse;
    const links = toLinks(
      typed.results.map((entry) => ({
        title: entry.title,
        url: entry.url,
      })),
    );

    return links === undefined ? step : { ...step, links };
  },
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
        classLevel: {
          type: ['string', 'null'],
          description:
            'Optional class level range to filter results. Only set this when the teacher explicitly mentioned the class. Pick the single range that best matches. If the teacher did not specify a target class, pass null so no filter is applied.',
          enum: [...MUNDO_CLASS_LEVELS, null],
        },
        subject: {
          type: ['string', 'null'],
          description:
            'Optional school subject to filter results. Pick exactly one subject that best matches the topic of the query. If no subject clearly fits, pass null so no filter is applied.',
          enum: [...MUNDO_SUBJECTS, null],
        },
      },
      required: ['query', 'classLevel', 'subject'],
      additionalProperties: false,
    },
  };

  const handler = async (args: Record<string, unknown>): Promise<MundoSearchToolResponse> => {
    const parsed = mundoSearchArgsSchema.safeParse(args);
    const rawQuery = parsed.success ? parsed.data.query.trim() : '';
    const query = rawQuery.slice(0, MUNDO_SEARCH_QUERY_LENGTH_LIMIT);

    if (query.length === 0) {
      const response: MundoSearchToolResponse = {
        results: [],
        retriedWithoutFilters: false,
        error: 'Error: Missing search query.',
      };
      return response;
    }

    const classLevel = sanitizeClassLevel(parsed.success ? parsed.data.classLevel : undefined);
    const subject = sanitizeSubject(parsed.success ? parsed.data.subject : undefined);
    const hasFilters = classLevel !== undefined || subject !== undefined;

    let results = await mundoSearch({ query, classLevel, subject });
    let retriedWithoutFilters = false;

    if (results.length === 0 && hasFilters) {
      results = await mundoSearch({ query });
      retriedWithoutFilters = true;
    }

    const response: MundoSearchToolResponse = {
      results,
      retriedWithoutFilters,
      error: results.length === 0 ? 'No MUNDO results found.' : null,
    };

    return response;
  };

  return {
    definition,
    handler,
    activity: mundoSearchActivity,
  };
}
