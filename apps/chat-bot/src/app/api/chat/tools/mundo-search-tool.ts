import {
  MUNDO_CLASS_LEVELS,
  MUNDO_SEARCH_QUERY_LENGTH_LIMIT,
  MUNDO_SEARCH_RESULTS_LIMIT,
  MUNDO_SUBJECTS,
} from '@/configuration-text-inputs/const';
import {
  mundoSearch,
  sanitizeClassLevel,
  sanitizeSubject,
  type MundoSearchResult,
} from '../mundo-search';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { parseJsonRecord, readString, toLinks, truncate } from '@/utils/chat/ai-activity';
import type { ToolDefinition, ToolRegistration } from './types';

type MundoSearchToolResponse = {
  results: MundoSearchResult[];
  retriedWithoutFilters: boolean;
  error: string | null;
};

export function buildMundoSearchTool(): ToolRegistration {
  const definition: ToolDefinition = {
    name: 'mundo_search',
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

  const handler = async (args: Record<string, unknown>): Promise<string> => {
    const rawQuery = typeof args.query === 'string' ? args.query.trim() : '';
    const query = rawQuery.slice(0, MUNDO_SEARCH_QUERY_LENGTH_LIMIT);

    if (query.length === 0) {
      const response: MundoSearchToolResponse = {
        results: [],
        retriedWithoutFilters: false,
        error: 'Error: Missing search query.',
      };
      return JSON.stringify(response);
    }

    const classLevel = sanitizeClassLevel(args.classLevel);
    const subject = sanitizeSubject(args.subject);
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

    return JSON.stringify(response);
  };

  return {
    definition,
    handler,
    activity: {
      createStep: (toolCall: ToolCall) => {
        const args = parseJsonRecord(toolCall.arguments);
        return {
          kind: 'tool' as const,
          id: toolCall.id,
          tool: 'mundo_search' as const,
          detail: truncate(readString(args, 'query')),
        };
      },
      applyResult: (step, result) => {
        const parsed = parseJsonRecord(result);
        const rawResults =
          parsed !== null && typeof parsed === 'object'
            ? (parsed as { results?: unknown }).results
            : undefined;
        const links = toLinks(
          Array.isArray(rawResults)
            ? rawResults.map((entry) => ({
                title: readString(entry, 'title'),
                url: readString(entry, 'url'),
              }))
            : undefined,
        );

        return links === undefined ? step : { ...step, links };
      },
    },
  };
}
