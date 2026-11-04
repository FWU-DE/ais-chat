import { Counter, metrics } from '@opentelemetry/api';

/**
 * Metric names following OpenTelemetry conventions
 */
const METRIC_NAMES = {
  CRAWL4AI_SUCCESS: 'crawl4ai_success_total',
  READABILITY_SUCCESS: 'readability_success_total',
  WEBSCRAPER_FAILED: 'webscraper_failed_total',
} as const;

/**
 * Metric descriptions
 */
const METRIC_DESCRIPTIONS = {
  CRAWL4AI_SUCCESS: 'Total number of successful crawl4ai operations',
  READABILITY_SUCCESS: 'Total number of successful readability operations',
  WEBSCRAPER_FAILED:
    'Total number of failed web scraping operations (both crawl4ai and readability)',
} as const;

// Initialize meter with proper naming convention
const meter = metrics.getMeter('ais-chat.webscraper', '0.1.0');

// Initialize all counters at module load time for better performance
const crawl4aiSuccessCounter: Counter = meter.createCounter(METRIC_NAMES.CRAWL4AI_SUCCESS, {
  description: METRIC_DESCRIPTIONS.CRAWL4AI_SUCCESS,
  unit: '1', // dimensionless counter
});

const readabilitySuccessCounter: Counter = meter.createCounter(METRIC_NAMES.READABILITY_SUCCESS, {
  description: METRIC_DESCRIPTIONS.READABILITY_SUCCESS,
  unit: '1', // dimensionless counter
});

const webScraperFailedCounter: Counter = meter.createCounter(METRIC_NAMES.WEBSCRAPER_FAILED, {
  description: METRIC_DESCRIPTIONS.WEBSCRAPER_FAILED,
  unit: '1', // dimensionless counter
});

/**
 * Increments the counter for successful crawl4ai operations
 * @param attributes - Optional attributes to add to the metric
 */
export function incrementCrawl4aiSuccessCounter(
  attributes?: Record<string, string | number>,
): void {
  crawl4aiSuccessCounter.add(1, attributes);
}

/**
 * Increments the counter for successful readability operations
 * @param attributes - Optional attributes to add to the metric
 */
export function incrementReadabilitySuccessCounter(
  attributes?: Record<string, string | number>,
): void {
  readabilitySuccessCounter.add(1, attributes);
}

/**
 * Increments the counter for failed web scraping operations
 * @param attributes - Optional attributes to add to the metric (e.g., error type, url)
 */
export function incrementWebScraperFailedCounter(
  attributes?: Record<string, string | number>,
): void {
  webScraperFailedCounter.add(1, attributes);
}
