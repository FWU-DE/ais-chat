import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserAndContext } from '@/auth/types';
import type { FileModel } from '@shared/db/schema';

const mocks = vi.hoisted(() => ({
  buildWebSearchToolMock: vi.fn(),
  buildWebScraperToolMock: vi.fn(),
  buildRetrieveEntireFileToolMock: vi.fn(),
  buildRetrieveTextChunksToolMock: vi.fn(),
  buildMundoSearchToolMock: vi.fn(),
  buildMathCalculateToolMock: vi.fn(),
}));

vi.mock('./tools/web-search-tool', () => ({
  buildWebSearchTool: mocks.buildWebSearchToolMock,
}));

vi.mock('./tools/web-scraper-tool', () => ({
  buildWebScraperTool: mocks.buildWebScraperToolMock,
}));

vi.mock('./tools/retrieve-entire-file-tool', () => ({
  buildRetrieveEntireFileTool: mocks.buildRetrieveEntireFileToolMock,
}));

vi.mock('./tools/retrieve-text-chunks-tool', () => ({
  buildRetrieveTextChunksTool: mocks.buildRetrieveTextChunksToolMock,
}));

vi.mock('./tools/mundo-search-tool', () => ({
  buildMundoSearchTool: mocks.buildMundoSearchToolMock,
}));

vi.mock('./tools/math-calculate-tool', () => ({
  buildMathCalculateTool: mocks.buildMathCalculateToolMock,
}));

const user = {
  id: 'user-1',
  userRole: 'teacher',
  federalState: {
    id: 'federal-state-1',
  },
} as UserAndContext;

const relatedFileEntities = [
  {
    id: 'file-1',
    name: 'test.pdf',
    size: 1000,
  },
] as FileModel[];

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock implementations - return tool-like objects
  mocks.buildWebSearchToolMock.mockResolvedValue({
    definition: {
      name: 'web_search',
      description: 'Search the web',
      parameters: { type: 'object', properties: {} },
    },
    handler: vi.fn(),
  });

  mocks.buildWebScraperToolMock.mockReturnValue({
    definition: {
      name: 'web_scraper',
      description: 'Scrape web pages',
      parameters: { type: 'object', properties: {} },
    },
    handler: vi.fn(),
  });

  mocks.buildRetrieveEntireFileToolMock.mockReturnValue({
    definition: {
      name: 'retrieve_entire_file',
      description: 'Retrieve entire file',
      parameters: { type: 'object', properties: {} },
    },
    handler: vi.fn(),
  });

  mocks.buildRetrieveTextChunksToolMock.mockReturnValue({
    definition: {
      name: 'retrieve_text_chunks',
      description: 'Retrieve text chunks',
      parameters: { type: 'object', properties: {} },
    },
    handler: vi.fn(),
  });

  mocks.buildMundoSearchToolMock.mockReturnValue({
    definition: {
      name: 'mundo_search',
      description: 'Search MUNDO',
      parameters: { type: 'object', properties: {} },
    },
    handler: vi.fn(),
  });

  mocks.buildMathCalculateToolMock.mockReturnValue({
    definition: {
      name: 'math_calculate',
      description: 'Calculate',
      parameters: { type: 'object' },
    },
    handler: vi.fn(),
  });
});

describe('buildTools', () => {
  it('builds toolRegistry with all enabled tools', async () => {
    const { buildTools } = await import('./build-tools');

    const { toolRegistry } = await buildTools({
      user,
      conversationId: 'conv-1',
      relatedFileEntities,
      allowWebTools: true,
      isCalculatorEnabled: true,
    });

    expect(Object.keys(toolRegistry)).toEqual([
      'math_calculate',
      'web_search',
      'web_scraper',
      'retrieve_entire_file',
      'retrieve_text_chunks',
    ]);
  });

  it('returns no calculator tool when disabled', async () => {
    const { buildTools } = await import('./build-tools');
    const { toolRegistry } = await buildTools({ user, relatedFileEntities, allowWebTools: false });
    expect(toolRegistry).not.toHaveProperty('math_calculate');
    expect(mocks.buildMathCalculateToolMock).not.toHaveBeenCalled();
  });

  it('skips tools that return null', async () => {
    mocks.buildWebSearchToolMock.mockResolvedValue(null);
    mocks.buildWebScraperToolMock.mockReturnValue(null);

    const { buildTools } = await import('./build-tools');

    const { toolRegistry } = await buildTools({
      user,
      conversationId: 'conv-1',
      relatedFileEntities,
      allowWebTools: true,
    });

    expect(Object.keys(toolRegistry)).toEqual(['retrieve_entire_file', 'retrieve_text_chunks']);
  });

  it('passes onWebSearchResults callback to web search tool', async () => {
    const { buildTools } = await import('./build-tools');

    const onWebSearchResults = vi.fn();

    await buildTools({
      user,
      conversationId: 'conv-1',
      relatedFileEntities,
      allowWebTools: true,
      onWebSearchResults,
    });

    expect(mocks.buildWebSearchToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onWebSearchResults,
      }),
    );
  });

  it('does not build web tools when allowWebTools is false', async () => {
    const { buildTools } = await import('./build-tools');

    const { toolRegistry } = await buildTools({
      user,
      conversationId: 'conv-1',
      relatedFileEntities,
      allowWebTools: false,
    });

    expect(Object.keys(toolRegistry)).toEqual(['retrieve_entire_file', 'retrieve_text_chunks']);
    expect(mocks.buildWebSearchToolMock).not.toHaveBeenCalled();
    expect(mocks.buildWebScraperToolMock).not.toHaveBeenCalled();
  });

  it('does not add mundo_search when allowMundoSearch is not set', async () => {
    const { buildTools } = await import('./build-tools');

    const { toolRegistry } = await buildTools({
      user,
      conversationId: 'conv-1',
      relatedFileEntities,
      allowWebTools: true,
      allowMundoSearch: false,
    });

    expect(Object.keys(toolRegistry)).not.toContain('mundo_search');
    expect(mocks.buildMundoSearchToolMock).not.toHaveBeenCalled();
  });

  it('adds mundo_search when allowMundoSearch is true', async () => {
    const { buildTools } = await import('./build-tools');

    const { toolRegistry } = await buildTools({
      user,
      conversationId: 'conv-1',
      relatedFileEntities,
      allowWebTools: true,
      allowMundoSearch: true,
    });

    expect(Object.keys(toolRegistry)).toContain('mundo_search');
    expect(mocks.buildMundoSearchToolMock).toHaveBeenCalledTimes(1);
  });
});
