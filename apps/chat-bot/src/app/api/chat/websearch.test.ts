import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserAndContext } from '@/auth/types';
import { HELP_MODE_ASSISTANT_ID } from '@shared/db/const';

const mocks = vi.hoisted(() => ({
  dbInsertConversationToolCallUsageMock: vi.fn(),
  dbUpdateTokenUsageByCharacterChatIdMock: vi.fn(),
  dbUpdateTokenUsageBySharedLearningScenarioIdMock: vi.fn(),
  dbGetToolCallCostByNameMock: vi.fn(),
  searchMock: vi.fn(),
  generateTextWithBillingMock: vi.fn(),
}));

vi.mock('./env', () => ({
  env: {
    linkupApiKey: 'linkup-api-key',
  },
}));

vi.mock('@shared/db/functions/character', () => ({
  dbUpdateTokenUsageByCharacterChatId: mocks.dbUpdateTokenUsageByCharacterChatIdMock,
}));

vi.mock('@shared/db/functions/learning-scenario', () => ({
  dbUpdateTokenUsageBySharedLearningScenarioId:
    mocks.dbUpdateTokenUsageBySharedLearningScenarioIdMock,
}));

vi.mock('linkup-sdk', () => ({
  LinkupClient: vi.fn(function LinkupClient(this: unknown) {
    return {
      search: mocks.searchMock,
    };
  }),
}));

vi.mock('@shared/db/functions/token-usage', () => ({
  dbInsertConversationToolCallUsage: mocks.dbInsertConversationToolCallUsageMock,
}));

vi.mock('@shared/db/functions/tool-call', () => ({
  dbGetToolCallCostByName: mocks.dbGetToolCallCostByNameMock,
}));

vi.mock('@ais-chat/ai-core', () => ({
  generateTextWithBilling: mocks.generateTextWithBillingMock,
}));

describe('searchWeb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbGetToolCallCostByNameMock.mockResolvedValue({ costsInCent: 0.42 });
    mocks.searchMock.mockResolvedValue({
      results: [
        {
          name: 'Result',
          url: 'https://example.com',
          content: 'content',
        },
      ],
    });
  });

  it('records normal chat tool call usage in conversation usage tracking', async () => {
    const { searchWeb } = await import('./websearch');

    await searchWeb({
      query: 'aktuelles thema',
      conversationId: 'conversation-1',
      userId: 'user-1',
    });

    expect(mocks.dbInsertConversationToolCallUsageMock).toHaveBeenCalledWith({
      toolCallName: 'web_search',
      conversationId: 'conversation-1',
      userId: 'user-1',
      costsInCent: 0.42,
    });
    expect(mocks.dbUpdateTokenUsageByCharacterChatIdMock).not.toHaveBeenCalled();
    expect(mocks.dbUpdateTokenUsageBySharedLearningScenarioIdMock).not.toHaveBeenCalled();
  });

  it('prefers conversation usage tracking when conversationId is present', async () => {
    const { searchWeb } = await import('./websearch');

    await searchWeb({
      query: 'aktuelles thema',
      conversationId: 'conversation-1',
      userId: 'user-1',
      characterId: 'character-uuid',
      learningScenarioId: 'learning-scenario-uuid',
    });

    expect(mocks.dbInsertConversationToolCallUsageMock).toHaveBeenCalledWith({
      toolCallName: 'web_search',
      conversationId: 'conversation-1',
      userId: 'user-1',
      costsInCent: 0.42,
    });
    expect(mocks.dbUpdateTokenUsageByCharacterChatIdMock).not.toHaveBeenCalled();
    expect(mocks.dbUpdateTokenUsageBySharedLearningScenarioIdMock).not.toHaveBeenCalled();
  });

  it('records shared character tool call usage in shared character usage tracking', async () => {
    const { searchWeb } = await import('./websearch');

    await searchWeb({
      query: 'aktuelles thema',
      userId: 'user-1',
      characterId: 'character-uuid',
    });

    expect(mocks.dbUpdateTokenUsageByCharacterChatIdMock).toHaveBeenCalledWith({
      toolCallName: 'web_search',
      characterId: 'character-uuid',
      userId: 'user-1',
      costsInCent: 0.42,
      completionTokens: 0,
      promptTokens: 0,
      modelId: null,
    });
    expect(mocks.dbInsertConversationToolCallUsageMock).not.toHaveBeenCalled();
    expect(mocks.dbUpdateTokenUsageBySharedLearningScenarioIdMock).not.toHaveBeenCalled();
  });

  it('records shared learning scenario tool call usage in shared learning scenario usage tracking', async () => {
    const { searchWeb } = await import('./websearch');

    await searchWeb({
      query: 'aktuelles thema',
      userId: 'user-1',
      learningScenarioId: 'learning-scenario-uuid',
    });

    expect(mocks.dbUpdateTokenUsageBySharedLearningScenarioIdMock).toHaveBeenCalledWith({
      toolCallName: 'web_search',
      learningScenarioId: 'learning-scenario-uuid',
      userId: 'user-1',
      costsInCent: 0.42,
      completionTokens: 0,
      promptTokens: 0,
      modelId: null,
    });
    expect(mocks.dbInsertConversationToolCallUsageMock).not.toHaveBeenCalled();
    expect(mocks.dbUpdateTokenUsageByCharacterChatIdMock).not.toHaveBeenCalled();
  });

  it('forwards includeDomains to the Linkup client when includedDomains is non-empty', async () => {
    const { searchWeb } = await import('./websearch');

    await searchWeb({
      query: 'aktuelles thema',
      conversationId: 'conversation-1',
      userId: 'user-1',
      includedDomains: ['example.com', 'foo.de'],
    });

    expect(mocks.searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        includeDomains: ['example.com', 'foo.de'],
      }),
    );
  });

  it('does not forward includeDomains when includedDomains is undefined', async () => {
    const { searchWeb } = await import('./websearch');

    await searchWeb({
      query: 'aktuelles thema',
      conversationId: 'conversation-1',
      userId: 'user-1',
    });

    expect(mocks.searchMock).toHaveBeenCalledTimes(1);
    expect(mocks.searchMock.mock.calls[0]![0]).not.toHaveProperty('includeDomains');
  });

  it('does not forward includeDomains when includedDomains is empty', async () => {
    const { searchWeb } = await import('./websearch');

    await searchWeb({
      query: 'aktuelles thema',
      conversationId: 'conversation-1',
      userId: 'user-1',
      includedDomains: [],
    });

    expect(mocks.searchMock).toHaveBeenCalledTimes(1);
    expect(mocks.searchMock.mock.calls[0]![0]).not.toHaveProperty('includeDomains');
  });
});

describe('resolveWebSearchConfig', () => {
  const user = {
    federalState: {
      featureToggles: { isWebSearchEnabled: true },
    },
  } as unknown as UserAndContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trims and drops empty domain entries from the given settings', async () => {
    const { resolveWebSearchConfig } = await import('./websearch');

    const config = resolveWebSearchConfig({
      user,
      webSearchSettings: {
        isWebSearchEnabled: true,
        webSearchScope: 'included-domains',
        webSearchIncludedDomains: ['  example.com  ', '', '   ', 'foo.de'],
      },
    });

    expect(config).toEqual({
      enabled: true,
      scope: 'included-domains',
      includedDomains: ['example.com', 'foo.de'],
    });
  });

  it('returns disabled config when the given settings have web search disabled', async () => {
    const { resolveWebSearchConfig } = await import('./websearch');

    const config = resolveWebSearchConfig({
      user,
      webSearchSettings: {
        isWebSearchEnabled: false,
        webSearchScope: 'all-web',
        webSearchIncludedDomains: [],
      },
    });

    expect(config).toEqual({
      enabled: false,
      scope: 'all-web',
      includedDomains: [],
    });
  });

  it('enables an unrestricted web search for a plain chat without custom chat settings', async () => {
    const { resolveWebSearchConfig } = await import('./websearch');

    const config = resolveWebSearchConfig({ user });

    expect(config).toEqual({
      enabled: true,
      scope: 'all-web',
      includedDomains: [],
    });
  });

  it('returns disabled config for the help mode assistant even when its settings enable web search', async () => {
    const { resolveWebSearchConfig } = await import('./websearch');

    const config = resolveWebSearchConfig({
      user,
      assistantId: HELP_MODE_ASSISTANT_ID,
      webSearchSettings: {
        isWebSearchEnabled: true,
        webSearchScope: 'all-web',
        webSearchIncludedDomains: [],
      },
    });

    expect(config).toEqual({
      enabled: false,
      scope: 'all-web',
      includedDomains: [],
    });
  });
});

describe('isWebSearchEnabledForEntity', () => {
  it('returns true when federal-state toggle and entity setting are both true', async () => {
    const { isWebSearchEnabledForEntity } = await import('./websearch');

    const result = isWebSearchEnabledForEntity({
      featureToggles: { isWebSearchEnabled: true },
      entity: { isWebSearchEnabled: true },
    });

    expect(result).toBe(true);
  });

  it('returns false when federal-state toggle is false', async () => {
    const { isWebSearchEnabledForEntity } = await import('./websearch');

    const result = isWebSearchEnabledForEntity({
      featureToggles: { isWebSearchEnabled: false },
      entity: { isWebSearchEnabled: true },
    });

    expect(result).toBe(false);
  });

  it('returns false when federal-state toggle is missing', async () => {
    const { isWebSearchEnabledForEntity } = await import('./websearch');

    const result = isWebSearchEnabledForEntity({
      featureToggles: {},
      entity: { isWebSearchEnabled: true },
    });

    expect(result).toBe(false);
  });

  it('returns false when entity setting is false', async () => {
    const { isWebSearchEnabledForEntity } = await import('./websearch');

    const result = isWebSearchEnabledForEntity({
      featureToggles: { isWebSearchEnabled: true },
      entity: { isWebSearchEnabled: false },
    });

    expect(result).toBe(false);
  });
});
