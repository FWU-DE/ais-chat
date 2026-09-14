import { LinkupClient } from 'linkup-sdk';
import { env } from './env';
import {
  WEBSEARCH_RESULT_LENGTH_LIMIT,
  WEBSEARCH_RESULTS_LIMIT,
} from '@/configuration-text-inputs/const';
import type { WebSearchModel, WebSearchResult, WebSearchScope } from '@shared/db/schema';
import { logError } from '@shared/logging';
import { dbInsertConversationToolCallUsage } from '@shared/db/functions/token-usage';
import { dbUpdateTokenUsageByCharacterChatId } from '@shared/db/functions/character';
import { dbUpdateTokenUsageBySharedLearningScenarioId } from '@shared/db/functions/learning-scenario';
import { dbGetToolCallCostByName } from '@shared/db/functions/tool-call';
import { UserAndContext } from '@/auth/types';
import { HELP_MODE_ASSISTANT_ID } from '@shared/db/const';

export type WebSearchConfig = {
  enabled: boolean;
  scope: WebSearchScope;
  includedDomains: string[];
};

const DISABLED_WEB_SEARCH_CONFIG: WebSearchConfig = {
  enabled: false,
  scope: 'all-web',
  includedDomains: [],
};

const ENABLED_ALL_WEB_CONFIG: WebSearchConfig = {
  enabled: true,
  scope: 'all-web',
  includedDomains: [],
};

function normalizeIncludedDomains(domains: string[]): string[] {
  return domains.map((domain) => domain.trim()).filter((domain) => domain.length > 0);
}

export function isWebSearchAvailableForFederalState(featureToggles: {
  isWebSearchEnabled?: boolean;
}): boolean {
  return (featureToggles.isWebSearchEnabled ?? false) && !!env.linkupApiKey;
}

export function resolveWebSearchConfig({
  user,
  assistantId,
  webSearchSettings,
}: {
  user: UserAndContext;
  assistantId?: string;
  webSearchSettings?: WebSearchModel;
}): WebSearchConfig {
  if (!isWebSearchAvailableForFederalState(user.federalState.featureToggles)) {
    return DISABLED_WEB_SEARCH_CONFIG;
  }

  if (assistantId === HELP_MODE_ASSISTANT_ID) return DISABLED_WEB_SEARCH_CONFIG;

  if (webSearchSettings) {
    if (!webSearchSettings.isWebSearchEnabled) return DISABLED_WEB_SEARCH_CONFIG;
    return {
      enabled: true,
      scope: webSearchSettings.webSearchScope,
      includedDomains: normalizeIncludedDomains(webSearchSettings.webSearchIncludedDomains),
    };
  }

  // No custom chat involved: plain chat may search the whole web.
  return ENABLED_ALL_WEB_CONFIG;
}

export function isWebSearchEnabledForEntity({
  featureToggles,
  entity,
}: {
  featureToggles: { isWebSearchEnabled?: boolean | undefined };
  entity: { isWebSearchEnabled: boolean };
}): boolean {
  if (
    isWebSearchAvailableForFederalState(featureToggles) &&
    featureToggles?.isWebSearchEnabled === true &&
    entity.isWebSearchEnabled === true
  )
    return true;

  return false;
}

async function recordWebSearchUsage({
  conversationId,
  characterId,
  learningScenarioId,
  userId,
}: {
  conversationId?: string;
  characterId?: string;
  learningScenarioId?: string;
  userId: string;
}) {
  let costsInCent = 0;

  try {
    costsInCent = (await dbGetToolCallCostByName('web_search')).costsInCent;
  } catch (error) {
    logError('Error loading web search tool call cost, using 0 cent fallback.', error);
  }

  try {
    if (conversationId) {
      await dbInsertConversationToolCallUsage({
        toolCallName: 'web_search',
        conversationId,
        userId,
        costsInCent,
      });
    } else if (characterId) {
      await dbUpdateTokenUsageByCharacterChatId({
        toolCallName: 'web_search',
        characterId,
        userId,
        costsInCent,
        completionTokens: 0,
        promptTokens: 0,
        modelId: null,
      });
    } else if (learningScenarioId) {
      await dbUpdateTokenUsageBySharedLearningScenarioId({
        toolCallName: 'web_search',
        learningScenarioId,
        userId,
        costsInCent,
        completionTokens: 0,
        promptTokens: 0,
        modelId: null,
      });
    } else {
      logError('Missing billing context for web search usage tracking');
    }
  } catch (error) {
    logError('Error recording web search usage billing.', error);
  }
}

/**
 * Performs a web search using the Linkup API and returns text search results.
 * Search results can be used in the rag context of the system prompt.
 *
 * @param query The search query string.
 * @param conversationId Optional conversation ID.
 * @param characterId Optional character ID.
 * @param learningScenarioId Optional learning scenario ID.
 * @param userId The user ID.
 * @param includedDomains Optional list of domains to restrict the search to.
 * @returns An array of text search results from the Linkup API.
 */
export async function searchWeb({
  query,
  conversationId,
  characterId,
  learningScenarioId,
  userId,
  includedDomains,
}: {
  query: string;
  conversationId?: string;
  characterId?: string;
  learningScenarioId?: string;
  userId: string;
  includedDomains?: string[];
}): Promise<WebSearchResult[]> {
  if (!env.linkupApiKey) {
    return [];
  }

  try {
    const linkupClient = new LinkupClient({
      apiKey: env.linkupApiKey,
    });

    const hasIncludedDomains = includedDomains !== undefined && includedDomains.length > 0;

    const searchResults = await linkupClient.search({
      query: query,
      depth: 'standard',
      outputType: 'searchResults',
      maxResults: WEBSEARCH_RESULTS_LIMIT,
      ...(hasIncludedDomains && { includeDomains: includedDomains }),
    });

    await recordWebSearchUsage({
      conversationId,
      characterId,
      learningScenarioId,
      userId,
    });

    if (!Array.isArray(searchResults.results)) {
      return [];
    }

    return (searchResults.results as WebSearchResult[]).map((result) => ({
      ...result,
      content: result.content.slice(0, WEBSEARCH_RESULT_LENGTH_LIMIT),
    }));
  } catch (error) {
    logError('Error during web search', error);
    return [];
  }
}
