import { isIP } from 'node:net';
import type { WebSource } from '@shared/db/types';
import { webScraper } from '../../web-scraper/web-scraper';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { parseJsonRecord, toLinks } from '@/utils/chat/ai-activity';
import type { BuildToolsContext, ToolDefinition, ToolRegistration } from './types';

type WebScraperToolResult = {
  title: string | null;
  url: string | null;
  content: string | null;
  error: string | null;
};

const MAX_WEB_SCRAPER_URLS = 5;

function formatWebScrapedContentForTool(result: WebSource) {
  const title = result.name?.trim() || null;
  const content = result.content?.trim() || null;

  const response: WebScraperToolResult = {
    title,
    url: result.link ?? null,
    content: null,
    error: null,
  };

  if (result.error) {
    response.error = 'Failed to fetch the page.';
    return JSON.stringify(response);
  }

  if (!content) {
    response.error = 'No usable content found.';
    return JSON.stringify(response);
  }

  response.content = content;
  return JSON.stringify(response);
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

export function buildWebScraperTool({
  sourceUrls,
  attachedLinks,
}: BuildWebScraperToolParams): ToolRegistration | null {
  const attachedSourceUrls = sourceUrls.length > 0 ? sourceUrls : attachedLinks;

  const definition: ToolDefinition = {
    name: 'web_scraper',
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
    const urls = Array.isArray(args.urls) ? args.urls : [];

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
          return JSON.stringify({
            title: null,
            url: null,
            content: null,
            error: 'Empty URL.',
          });
        }

        const validationResult = validateWebScraperUrl(urlString);

        if (validationResult.error) {
          return JSON.stringify({
            title: null,
            url: urlString,
            content: null,
            error: validationResult.error,
          });
        }

        const result = await webScraper(validationResult.url);
        return formatWebScrapedContentForTool(result);
      }),
    );

    return JSON.stringify(results.map((r) => JSON.parse(r)));
  };

  return {
    definition,
    handler,
    activity: {
      createStep: (toolCall: ToolCall) => {
        const args = parseJsonRecord(toolCall.arguments);
        const urls =
          args !== null && typeof args === 'object' ? (args as { urls?: unknown }).urls : [];
        return {
          kind: 'tool' as const,
          id: toolCall.id,
          tool: 'web_scraper' as const,
          links: toLinks(Array.isArray(urls) ? urls.map((url) => ({ url })) : []),
        };
      },
      applyResult: (step, result) => {
        const links = toLinks(parseJsonRecord(result));
        return links === undefined ? step : { ...step, links };
      },
    },
  };
}
