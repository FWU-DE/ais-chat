import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserAndContext } from '@/auth/types';
import type { WebSearchConfig } from '../websearch';

const mocks = vi.hoisted(() => ({
  resolveWebSearchConfigMock: vi.fn(),
  searchWebMock: vi.fn(),
}));

vi.mock('../websearch', () => ({
  resolveWebSearchConfig: mocks.resolveWebSearchConfigMock,
  searchWeb: mocks.searchWebMock,
}));

const disabledConfig: WebSearchConfig = {
  enabled: false,
  scope: 'all-web',
  includedDomains: [],
};

const allWebConfig: WebSearchConfig = {
  enabled: true,
  scope: 'all-web',
  includedDomains: [],
};

const user = {
  id: 'user-1',
  userRole: 'teacher',
  federalState: {
    id: 'federal-state-1',
    supportContacts: null,
    chatStorageTime: 120,
    featureToggles: {
      isStudentAccessEnabled: true,
      isCharacterEnabled: true,
      isSharedChatEnabled: true,
      isCustomGptEnabled: true,
      isShareTemplateWithSchoolEnabled: true,
      isImageGenerationEnabled: true,
      isWebSearchEnabled: false,
    },
  },
} as UserAndContext;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveWebSearchConfigMock.mockReturnValue(disabledConfig);
  mocks.searchWebMock.mockResolvedValue([]);
});

describe('buildWebSearchTool', () => {
  it('returns null when web search is disabled', async () => {
    mocks.resolveWebSearchConfigMock.mockReturnValue(disabledConfig);
    const { buildWebSearchTool } = await import('./web-search-tool');

    const result = await buildWebSearchTool({
      user,
      conversationId: 'conversation-1',
    });

    expect(result).toBeNull();
  });

  it('adds a web search tool and returns search results as JSON', async () => {
    mocks.resolveWebSearchConfigMock.mockReturnValue(allWebConfig);
    mocks.searchWebMock.mockResolvedValue([
      {
        name: 'Beispielartikel',
        url: 'https://example.com/search-result',
        content: 'Kurzer Auszug aus dem Suchergebnis.',
      },
    ]);

    const { buildWebSearchTool } = await import('./web-search-tool');

    const tool = await buildWebSearchTool({
      user,
      conversationId: 'conversation-1',
    });

    expect(tool).not.toBeNull();
    expect(tool!.definition).toMatchObject({
      name: 'web_search',
    });
    expect(tool!.definition.parameters).toMatchObject({
      required: ['query'],
    });

    const result = await tool!.handler({
      query: 'aktuelle information',
    });

    expect(mocks.searchWebMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'aktuelle information',
        conversationId: 'conversation-1',
        userId: 'user-1',
      }),
    );
    expect(JSON.parse(result)).toEqual({
      results: [
        {
          title: 'Beispielartikel',
          url: 'https://example.com/search-result',
          content: 'Kurzer Auszug aus dem Suchergebnis.',
        },
      ],
      error: null,
    });
  });

  it('calls onWebSearchResults callback when provided', async () => {
    mocks.resolveWebSearchConfigMock.mockReturnValue(allWebConfig);
    mocks.searchWebMock.mockResolvedValue([
      {
        name: 'Test',
        url: 'https://example.com',
        content: 'Content',
      },
    ]);

    const { buildWebSearchTool } = await import('./web-search-tool');

    const onWebSearchResults = vi.fn();
    const tool = await buildWebSearchTool({
      user,
      conversationId: 'conversation-1',
      onWebSearchResults,
    });

    await tool!.handler({ query: 'test' });

    expect(onWebSearchResults).toHaveBeenCalledWith([
      {
        name: 'Test',
        url: 'https://example.com',
        content: 'Content',
      },
    ]);
  });

  it('forwards includedDomains to searchWeb when scope is included-domains', async () => {
    mocks.resolveWebSearchConfigMock.mockReturnValue({
      enabled: true,
      scope: 'included-domains',
      includedDomains: ['example.com', 'foo.de'],
    } satisfies WebSearchConfig);

    const { buildWebSearchTool } = await import('./web-search-tool');

    const tool = await buildWebSearchTool({
      user,
      characterId: 'character-uuid',
      conversationId: 'conversation-1',
    });

    await tool!.handler({ query: 'aktuelle information' });

    expect(mocks.searchWebMock).toHaveBeenCalledWith(
      expect.objectContaining({
        includedDomains: ['example.com', 'foo.de'],
      }),
    );
  });

  it('forwards includedDomains for learning scenarios when scope is included-domains', async () => {
    mocks.resolveWebSearchConfigMock.mockReturnValue({
      enabled: true,
      scope: 'included-domains',
      includedDomains: ['example.com', 'foo.de'],
    } satisfies WebSearchConfig);

    const { buildWebSearchTool } = await import('./web-search-tool');

    const tool = await buildWebSearchTool({
      user,
      learningScenarioId: 'learning-scenario-uuid',
      conversationId: 'conversation-1',
    });

    await tool!.handler({ query: 'aktuelle information' });

    expect(mocks.searchWebMock).toHaveBeenCalledWith(
      expect.objectContaining({
        includedDomains: ['example.com', 'foo.de'],
      }),
    );
  });

  it('forwards includedDomains for assistants when scope is included-domains', async () => {
    mocks.resolveWebSearchConfigMock.mockReturnValue({
      enabled: true,
      scope: 'included-domains',
      includedDomains: ['example.com', 'foo.de'],
    } satisfies WebSearchConfig);

    const { buildWebSearchTool } = await import('./web-search-tool');

    const tool = await buildWebSearchTool({
      user,
      assistantId: 'assistant-uuid',
      conversationId: 'conversation-1',
    });

    await tool!.handler({ query: 'aktuelle information' });

    expect(mocks.searchWebMock).toHaveBeenCalledWith(
      expect.objectContaining({
        includedDomains: ['example.com', 'foo.de'],
      }),
    );
  });

  it('does not forward includedDomains when scope is all-web', async () => {
    mocks.resolveWebSearchConfigMock.mockReturnValue(allWebConfig);

    const { buildWebSearchTool } = await import('./web-search-tool');

    const tool = await buildWebSearchTool({
      user,
      conversationId: 'conversation-1',
    });

    await tool!.handler({ query: 'aktuelle information' });

    expect(mocks.searchWebMock).toHaveBeenCalledTimes(1);
    expect(mocks.searchWebMock.mock.calls[0]![0]).toMatchObject({
      includedDomains: undefined,
    });
  });
});
