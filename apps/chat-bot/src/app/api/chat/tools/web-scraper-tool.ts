import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord, toLinks } from '@/utils/chat/ai-activity';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import type { WebSource } from '@shared/db/types';
import { isIP } from 'node:net';
import { z } from 'zod';
import { webScraper } from '../../web-scraper/web-scraper';
import type { BuildToolsContext, ToolActivity, ToolDefinition, ToolRegistration } from './types';

const MAX_WEB_SCRAPER_URLS = 5;

export const webScraperArgsSchema = z.object({
  urls: z.array(z.string()),
});

export type WebScraperToolResponse = {
  title: string | null;
  url: string | null;
  content: string | null;
  error: string | null;
};

function formatWebScrapedContentForTool(result: WebSource) {
  const title = result.name?.trim() || null;
  const content = result.content?.trim() || null;

  const response: WebScraperToolResponse = {
    title,
    url: result.link ?? null,
    content: null,
    error: null,
  };

  if (result.error) {
    response.error = 'Failed to fetch the page.';
    return response;
  }

  if (!content) {
    response.error = 'No usable content found.';
    return response;
  }

  response.content = content;
  return response;
}

function validateWebScraperUrl(inputUrl: string): { url: string; error?: string } {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(inputUrl);
  } catch {
    return { url: '', error: 'Error: Invalid URL.' };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { url: '', error: 'Error: Only http and https URLs are allowed.' };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    isIP(hostname) !== 0
  ) {
    return { url: '', error: 'Error: Only domain hosts are allowed.' };
  }

  return { url: parsedUrl.toString() };
}

type BuildWebScraperToolParams = Pick<
  BuildToolsContext,
  'characterId' | 'learningScenarioId' | 'sourceUrls' | 'attachedLinks'
>;

export const webScraperActivity: ToolActivity<WebScraperToolResponse> = {
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
    const links = toLinks(Array.isArray(result) ? result : undefined);
    return links === undefined ? step : { ...step, links };
  },
};

export function buildWebScraperTool({
  sourceUrls,
  attachedLinks,
}: BuildWebScraperToolParams): ToolRegistration<
  typeof TOOL_NAMES.webScraper,
  WebScraperToolResponse
> | null {
  const attachedSourceUrls = sourceUrls.length > 0 ? sourceUrls : attachedLinks;

  const definition: ToolDefinition<typeof TOOL_NAMES.webScraper> = {
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

  const handler = async (args: Record<string, unknown>) => {
    const parsed = webScraperArgsSchema.safeParse(args);
    const urls = parsed.success ? parsed.data.urls : [];

    if (urls.length === 0) {
      return 'Error: Missing URLs.';
    }

    if (urls.length > MAX_WEB_SCRAPER_URLS) {
      return `Error: Maximum ${MAX_WEB_SCRAPER_URLS} URLs allowed per call.`;
    }

    const results = await Promise.all(
      urls.map(async (url) => {
        const urlString = typeof url === 'string' ? url.trim() : '';

        if (urlString.length === 0) {
          return {
            title: null,
            url: null,
            content: null,
            error: 'Empty URL.',
          };
        }

        const validationResult = validateWebScraperUrl(urlString);

        if (validationResult.error) {
          return {
            title: null,
            url: urlString,
            content: null,
            error: validationResult.error,
          };
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
    activity: webScraperActivity,
  };
}
