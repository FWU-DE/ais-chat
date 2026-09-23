import { WEB_SCRAPE_RESULT_LENGTH_LIMIT } from '@/configuration-text-inputs/const';
import { defaultErrorSource } from '@/components/chat/sources/const';
import { logWarning } from '@shared/logging';
import { env } from '@/env';
import { WebSource } from '@shared/db/types';

interface Crawl4AIResult {
  url: string;
  html: string;
  success: boolean;
  screenshot?: string; // Base64 encoded screenshot
  markdown?: {
    raw_markdown?: string;
    fit_markdown?: string;
  };
  metadata?: {
    title?: string;
    description?: string;
    'og:title'?: string;
  };
  error_message?: string;
  status_code?: number;
}

interface Crawl4AIResponse {
  success: boolean;
  results: Crawl4AIResult[];
  error?: string;
}

/**
 * Scrapes web content using Crawl4AI and returns markdown.
 * Uses the Crawl4AI docker container API to extract content.
 * @param url The URL to fetch and parse.
 * @returns The most important information from the page in markdown format.
 */
export async function webScraperCrawl4AI(url: string): Promise<WebSource> {
  try {
    const timeout = 30_000; // 30 seconds timeout for crawl4ai
    const response = await fetch(new URL('/crawl', env.crawl4AIUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.crawl4AIToken && {
          Authorization: 'Bearer ' + env.crawl4AIToken,
        }),
      },
      body: JSON.stringify({
        urls: [url],
        crawler_config: {
          type: 'CrawlerRunConfig',
          params: {
            word_count_threshold: 10, // Filter out tiny text blocks, e.g. buttons, labels
            remove_overlay_elements: true, // Remove popups
            screenshot: false, // for debugging
            page_timeout: timeout,
            excluded_tags: [
              'nav',
              'header',
              'footer',
              'aside',
              'form',
              'button',
              'iframe',
              'script',
              'style',
              'svg',
              'noscript',
              'label',
            ], // Delete tags that usually don't contain main content
            markdown_generator: {
              type: 'DefaultMarkdownGenerator',
              params: {
                options: {
                  type: 'dict',
                  value: {
                    ignore_links: true,
                    ignore_images: true,
                    body_width: 0, // No automatic text wrapping
                  },
                },
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(timeout + 5_000), // additional 5 seconds timeout for the request itself
    });

    if (!response.ok) {
      const responseBody = await response.text();
      logWarning(`Crawl4AI request failed with status ${response.status} for URL: ${url}`, {
        responseBody: responseBody.substring(0, 10_000),
        responseBodyLength: responseBody.length,
      });
      return defaultErrorSource(url);
    }

    const data = (await response.json()) as Crawl4AIResponse;
    const result = data.results?.[0];

    if (!data.success || !result || !result.success) {
      logWarning(
        `Crawl4AI returned no result for URL: ${url}, error: ${data.error ?? result?.error_message}`,
      );
      return defaultErrorSource(url);
    }

    // Extract markdown content from the result object
    const markdownContent = result.markdown?.raw_markdown?.trim() || '';

    if (!markdownContent) {
      logWarning(`Crawl4AI returned no markdown content for URL: ${url}`);
      return defaultErrorSource(url);
    }

    // Extract title from metadata or fallback
    const title = result.metadata?.['og:title'] || result.metadata?.title;

    // Trim content
    const trimmedContent = markdownContent.substring(0, WEB_SCRAPE_RESULT_LENGTH_LIMIT);

    return {
      content: trimmedContent,
      name: title,
      link: url,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logWarning(`Crawl4AI request timed out for URL: ${url}`);
      return defaultErrorSource(url);
    }

    logWarning(`Crawl4AI request failed for URL: ${url}`);
    return defaultErrorSource(url);
  }
}
