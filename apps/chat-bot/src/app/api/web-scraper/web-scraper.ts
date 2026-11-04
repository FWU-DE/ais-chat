import { defaultErrorSource } from '@/components/chat/sources/const';
import { WebSource } from '@shared/db/types';
import { logError, logWarning } from '@shared/logging';
import {
  incrementCrawl4aiSuccessCounter,
  incrementReadabilitySuccessCounter,
  incrementWebScraperFailedCounter,
} from '@shared/metrics/web-scraper-meter';
import { webScraperCrawl4AI } from './web-scraper-crawl4ai';
import { webScraperReadability } from './web-scraper-readability';

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Scrapes web content and returns markdown.
 * @param url The URL to fetch and parse.
 * @returns The most important information from the page.
 */
export async function webScraper(url: string): Promise<WebSource> {
  try {
    const urlObj = new URL(url);
    if (!ALLOWED_PROTOCOLS.includes(urlObj.protocol)) {
      logError(`Webscraper blocked URL with disallowed protocol: ${url}`); // this should never happen since we only extract http/https URLs
      return defaultErrorSource(url);
    }
  } catch {
    logError(`Invalid URL: ${url}`); // this should never happen since we only extract valid URLs
    return defaultErrorSource(url);
  }

  // Try Crawl4AI first
  let result = await webScraperCrawl4AI(url);

  if (!result.error && result.content && result.content.length > 0) {
    incrementCrawl4aiSuccessCounter();
    return result;
  }

  // Fallback to Readability-based scraper
  logWarning(`Crawl4AI returned no result for URL: ${url}, fallback to Readability.`);
  result = await webScraperReadability(url);

  if (!result.error && result.content && result.content.length > 0) {
    incrementReadabilitySuccessCounter({ url: result.link });
    return result;
  }

  // Both scrapers failed
  incrementWebScraperFailedCounter({ url: result.link });
  return result;
}
