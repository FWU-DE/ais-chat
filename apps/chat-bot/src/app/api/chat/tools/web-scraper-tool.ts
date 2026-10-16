import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord, toLinks } from '@/utils/chat/ai-activity';
import type { ToolCall, ToolOutcome } from '@ais-chat/ai-core/chat/types';
import type { WebSource } from '@shared/db/types';
import { isIP } from 'node:net';
import { z } from 'zod';
import { webScraper } from '../../web-scraper/web-scraper';
import type { BuildToolsContext, ToolDefinition, ToolRegistration } from './types';

const MAX_WEB_SCRAPER_URLS = 5;

export const webScraperArgsSchema = z.object({
  urls: z.array(z.string().trim()).min(1),
});

export type WebScraperToolResult = {
  url?: string;
  title?: string;
  content?: string;
  error?: string;
};

function formatWebScrapedContentForTool(result: WebSource): WebScraperToolResult {
  const url = result.link ?? undefined;
  const title = result.name?.trim() || undefined;
  const content = result.content?.trim() || undefined;

  if (result.error) {
    return { url, title, error: 'Failed to fetch the page.' };
  }

  if (!content) {
    return { url, title, error: 'No usable content found.' };
  }

  return { url, title, content };
}

function validateWebScraperUrl(inputUrl: string): { url: string } | { error: string } {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(inputUrl);
  } catch {
    return { error: 'Error: Invalid URL.' };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { error: 'Error: Only http and https URLs are allowed.' };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    isIP(hostname) !== 0
  ) {
    return { error: 'Error: Only domain hosts are allowed.' };
  }

  return { url: parsedUrl.toString() };
}

type BuildWebScraperToolParams = Pick<
  BuildToolsContext,
  'characterId' | 'learningScenarioId' | 'sourceUrls' | 'attachedLinks'
>;

export function buildWebScraperTool({
  sourceUrls,
  attachedLinks,
}: BuildWebScraperToolParams): ToolRegistration<WebScraperToolResult[]> | null {
  const attachedSourceUrls = sourceUrls.length > 0 ? sourceUrls : attachedLinks;

  const definition: ToolDefinition = {
    name: TOOL_NAMES.webScraper,
    description:
      `Fetch and extract the main text from one or more URLs (max ${MAX_WEB_SCRAPER_URLS}). Use this tool when the user gives you webpage URLs or when you can derive concrete URLs yourself, for example to scrape documentation pages or other known targets. Use web_search instead when you need to discover relevant pages or compare multiple sources.` +
      (attachedSourceUrls.length > 0
        ? `\n\nThe following URLs were pinned for this conversation and are likely relevant — consider scraping them when appropriate:\n${attachedSourceUrls.map((link) => `- ${link}`).join('\n')}`
        : ''),
    parameters: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          description:
            'Array of URLs to scrape. Each must be a valid http or https URL. Only domain hosts are allowed (no localhost, .local, or IP addresses).',
          items: {
            type: 'string',
          },
          minItems: 1,
          maxItems: MAX_WEB_SCRAPER_URLS,
        },
      },
      required: ['urls'],
      additionalProperties: false,
    },
  };

  const handler = async (args: Record<string, unknown>): ToolOutcome<WebScraperToolResult[]> => {
    const parsed = webScraperArgsSchema.safeParse(args);
    const urls = parsed.success ? parsed.data.urls : [];

    if (urls.length === 0) {
      return { error: 'Missing URLs.' };
    }

    if (urls.length > MAX_WEB_SCRAPER_URLS) {
      return { error: `Maximum ${MAX_WEB_SCRAPER_URLS} URLs allowed per call.` };
    }

    const results = await Promise.all(
      urls.map(async (url) => {
        if (!url) {
          return { error: 'Empty URL.' };
        }

        const validationResult = validateWebScraperUrl(url);

        if ('error' in validationResult) {
          return { url, error: validationResult.error };
        }

        const result = await webScraper(validationResult.url);
        return formatWebScrapedContentForTool(result);
      }),
    );

    return results;
  };

  return {
    definition,
    handler,
    activity: {
      createStep: (toolCall: ToolCall) => {
        const parsed = webScraperArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));
        return {
          kind: 'tool',
          id: toolCall.id,
          tool: TOOL_NAMES.webScraper,
          links: toLinks(parsed.success ? parsed.data.urls.map((url) => ({ url })) : []),
        };
      },
      applyResult: (step, result) => {
        const links = toLinks(result);
        return links === undefined ? step : { ...step, links };
      },
    },
  };
}
