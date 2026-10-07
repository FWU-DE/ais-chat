import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileModel } from '@shared/db/schema';
import type { UserAndContext } from '@/auth/types';
import { VECTOR_SEARCH_LIMIT } from '@/configuration-text-inputs/const';

const mocks = vi.hoisted(() => ({
  ingestWebContentMock: vi.fn(),
  retrieveChunksByQueryMock: vi.fn(),
  dbGetAllChunksMock: vi.fn(),
}));

vi.mock('../../rag/ingestWebContent', () => ({
  ingestWebContent: mocks.ingestWebContentMock,
}));

vi.mock('../../rag/rag-service', () => ({
  retrieveChunksByQuery: mocks.retrieveChunksByQueryMock,
}));

vi.mock('@shared/db/functions/files', () => ({
  dbGetAllChunks: mocks.dbGetAllChunksMock,
}));

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

const relatedFileEntities = [
  {
    id: 'file-1',
    name: 'Arbeitsblatt.pdf',
    size: 120_000,
  },
  {
    id: 'file-2',
    name: 'Leitfaden.txt',
    size: 8_000,
  },
] as FileModel[];

/** More chunks than VECTOR_SEARCH_LIMIT — forces the vector search path */
const overLimitChunks = Array.from({ length: VECTOR_SEARCH_LIMIT + 1 }, (_, i) => ({
  fileId: 'file-1',
  fileName: 'Arbeitsblatt.pdf',
  sourceUrl: null,
  orderIndex: i,
  content: `Chunk ${i}.`,
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: total chunks exceed the limit → vector search path
  mocks.dbGetAllChunksMock.mockResolvedValue(overLimitChunks);
  mocks.retrieveChunksByQueryMock.mockResolvedValue([
    {
      id: 'chunk-1',
      content: 'Erster relevanter Abschnitt.',
      fileId: 'file-1',
      fileName: 'Arbeitsblatt.pdf',
      orderIndex: 0,
      sourceType: 'file',
      sourceUrl: null,
    },
  ]);
  mocks.ingestWebContentMock.mockResolvedValue({ processedUrls: [], errorUrls: [] });
});

describe('buildRetrieveTextChunksTool', () => {
  it('returns null when no files and no source URLs', async () => {
    const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

    const result = buildRetrieveTextChunksTool({
      user,
      relatedFileEntities: [],
      sourceUrls: [],
      attachedLinks: [],
    });

    expect(result).toBeNull();
  });

  it('adds a chunk retrieval tool that exposes file names and forwards the search query', async () => {
    const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

    const tool = buildRetrieveTextChunksTool({
      user,
      relatedFileEntities,
      sourceUrls: [],
      attachedLinks: [],
    });

    expect(tool).not.toBeNull();
    expect(tool!.definition).toMatchObject({
      name: 'retrieve_text_chunks',
    });
    expect(tool!.definition.description).toContain('Arbeitsblatt.pdf (120000 bytes)');
    expect(tool!.definition.description).toContain('Leitfaden.txt (8000 bytes)');
    expect(tool!.definition.parameters).toMatchObject({
      required: ['search'],
      properties: {
        search: {
          type: 'string',
        },
      },
    });

    const result = await tool!.handler({
      search: 'relevante Passage',
    });

    expect(mocks.retrieveChunksByQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: 'relevante Passage',
        federalStateId: 'federal-state-1',
        relatedFileEntities,
        limit: VECTOR_SEARCH_LIMIT,
      }),
    );
    expect(result).toEqual({
      chunks: [
        {
          fileName: 'Arbeitsblatt.pdf',
          orderIndex: 0,
          content: 'Erster relevanter Abschnitt.',
        },
      ],
      error: null,
    });
  });

  it('adds a chunk retrieval tool for linked pages and forwards source urls', async () => {
    mocks.ingestWebContentMock.mockResolvedValueOnce({
      processedUrls: ['https://example.com/shared-page'],
      errorUrls: [],
    });

    const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

    const tool = buildRetrieveTextChunksTool({
      user,
      relatedFileEntities: [],
      sourceUrls: ['https://example.com/shared-page'],
      attachedLinks: [],
    });

    expect(tool).not.toBeNull();
    expect(tool!.definition.description).toContain('https://example.com/shared-page');

    await tool!.handler({
      search: 'verlinkter Inhalt',
    });

    expect(mocks.retrieveChunksByQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: 'verlinkter Inhalt',
        federalStateId: 'federal-state-1',
        relatedFileEntities: [],
        sourceUrls: ['https://example.com/shared-page'],
      }),
    );
  });

  it('ingests linked pages before retrieving chunks', async () => {
    mocks.retrieveChunksByQueryMock.mockResolvedValueOnce([
      {
        id: 'chunk-2',
        content: 'Neu abgerufener Seitenabschnitt.',
        fileId: null,
        fileName: null,
        orderIndex: 0,
        sourceType: 'webpage',
        sourceUrl: 'https://example.com/shared-page',
      },
    ]);
    mocks.ingestWebContentMock.mockResolvedValueOnce({
      processedUrls: ['https://example.com/shared-page'],
      errorUrls: [],
    });

    const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

    const tool = buildRetrieveTextChunksTool({
      user,
      relatedFileEntities: [],
      sourceUrls: ['https://example.com/shared-page'],
      attachedLinks: [],
    });

    const result = await tool!.handler({
      search: 'verlinkter Inhalt',
    });

    expect(mocks.ingestWebContentMock).toHaveBeenCalledWith({
      urls: ['https://example.com/shared-page'],
      federalStateId: 'federal-state-1',
    });
    expect(mocks.retrieveChunksByQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: 'verlinkter Inhalt',
        federalStateId: 'federal-state-1',
        relatedFileEntities: [],
        sourceUrls: ['https://example.com/shared-page'],
      }),
    );
    expect(result).toEqual({
      chunks: [
        {
          fileName: null,
          orderIndex: 0,
          content: 'Neu abgerufener Seitenabschnitt.',
        },
      ],
      error: null,
    });
  });

  it('returns error when no chunks found', async () => {
    mocks.retrieveChunksByQueryMock.mockResolvedValueOnce([]);

    const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

    const tool = buildRetrieveTextChunksTool({
      user,
      relatedFileEntities,
      sourceUrls: [],
      attachedLinks: [],
    });

    const result = await tool!.handler({
      search: 'not found',
    });

    const parsed = result;
    expect(parsed.chunks).toEqual([]);
    expect(parsed.error).toBe('No matching chunks found.');
  });

  describe('short-circuit when total chunk count ≤ VECTOR_SEARCH_LIMIT', () => {
    it('passes both file IDs and processed source URLs to dbGetAllChunks', async () => {
      mocks.ingestWebContentMock.mockResolvedValueOnce({
        processedUrls: ['https://example.com/page'],
        errorUrls: [],
      });

      const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

      const tool = buildRetrieveTextChunksTool({
        user,
        relatedFileEntities,
        sourceUrls: ['https://example.com/page'],
        attachedLinks: [],
      });

      await tool!.handler({ search: 'suche' });

      expect(mocks.dbGetAllChunksMock).toHaveBeenCalledWith({
        fileIds: ['file-1', 'file-2'],
        sourceUrls: ['https://example.com/page'],
        limit: VECTOR_SEARCH_LIMIT + 1,
      });
    });

    it('returns all chunks directly without a vector search when total fits within the limit', async () => {
      mocks.dbGetAllChunksMock.mockResolvedValue([
        {
          fileId: 'file-1',
          fileName: 'Arbeitsblatt.pdf',
          sourceUrl: null,
          orderIndex: 0,
          content: 'Chunk A1.',
        },
        {
          fileId: 'file-1',
          fileName: 'Arbeitsblatt.pdf',
          sourceUrl: null,
          orderIndex: 1,
          content: 'Chunk A2.',
        },
        {
          fileId: 'file-1',
          fileName: 'Arbeitsblatt.pdf',
          sourceUrl: null,
          orderIndex: 2,
          content: 'Chunk A3.',
        },
        {
          fileId: 'file-2',
          fileName: 'Leitfaden.txt',
          sourceUrl: null,
          orderIndex: 0,
          content: 'Chunk B1.',
        },
        {
          fileId: 'file-2',
          fileName: 'Leitfaden.txt',
          sourceUrl: null,
          orderIndex: 1,
          content: 'Chunk B2.',
        },
        {
          fileId: 'file-2',
          fileName: 'Leitfaden.txt',
          sourceUrl: null,
          orderIndex: 2,
          content: 'Chunk B3.',
        },
        {
          fileId: 'file-2',
          fileName: 'Leitfaden.txt',
          sourceUrl: null,
          orderIndex: 3,
          content: 'Chunk B4.',
        },
      ]); // total = 7 ≤ VECTOR_SEARCH_LIMIT

      const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

      const tool = buildRetrieveTextChunksTool({
        user,
        relatedFileEntities,
        sourceUrls: [],
        attachedLinks: [],
      });

      const result = await tool!.handler({ search: 'irgendwas' });
      const parsed = result;

      expect(mocks.retrieveChunksByQueryMock).not.toHaveBeenCalled();
      expect(parsed.chunks).toHaveLength(7);
      expect(parsed.error).toBeNull();
    });

    it('short-circuits for URL-only sources when total fits within the limit', async () => {
      mocks.ingestWebContentMock.mockResolvedValueOnce({
        processedUrls: ['https://example.com/page'],
        errorUrls: [],
      });
      mocks.dbGetAllChunksMock.mockResolvedValue([
        {
          fileId: null,
          fileName: null,
          sourceUrl: 'https://example.com/page',
          orderIndex: 0,
          content: 'Web chunk 1.',
        },
        {
          fileId: null,
          fileName: null,
          sourceUrl: 'https://example.com/page',
          orderIndex: 1,
          content: 'Web chunk 2.',
        },
      ]); // total = 2 ≤ VECTOR_SEARCH_LIMIT

      const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

      const tool = buildRetrieveTextChunksTool({
        user,
        relatedFileEntities: [],
        sourceUrls: ['https://example.com/page'],
        attachedLinks: [],
      });

      const result = await tool!.handler({ search: 'suche' });
      const parsed = result;

      expect(mocks.retrieveChunksByQueryMock).not.toHaveBeenCalled();
      expect(parsed.chunks).toHaveLength(2);
      expect(parsed.error).toBeNull();
    });

    it('still calls vector search when total chunk count exceeds the limit', async () => {
      // default beforeEach mock already sets total > VECTOR_SEARCH_LIMIT
      const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

      const tool = buildRetrieveTextChunksTool({
        user,
        relatedFileEntities,
        sourceUrls: [],
        attachedLinks: [],
      });

      await tool!.handler({ search: 'suche' });

      expect(mocks.dbGetAllChunksMock).toHaveBeenCalled();
      expect(mocks.retrieveChunksByQueryMock).toHaveBeenCalled();
    });

    it('treats the exact limit as small (≤ not <) and skips vector search', async () => {
      mocks.dbGetAllChunksMock.mockResolvedValue(
        Array.from({ length: VECTOR_SEARCH_LIMIT }, (_, i) => ({
          fileId: 'file-1',
          fileName: 'Arbeitsblatt.pdf',
          sourceUrl: null,
          orderIndex: i,
          content: `Chunk ${i}.`,
        })),
      ); // total === VECTOR_SEARCH_LIMIT

      const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

      const tool = buildRetrieveTextChunksTool({
        user,
        relatedFileEntities,
        sourceUrls: [],
        attachedLinks: [],
      });

      await tool!.handler({ search: 'suche' });

      expect(mocks.retrieveChunksByQueryMock).not.toHaveBeenCalled();
      expect(mocks.dbGetAllChunksMock).toHaveBeenCalled();
    });

    it('returns error when all chunks retrieved directly but result is empty', async () => {
      mocks.dbGetAllChunksMock.mockResolvedValue([]);

      const { buildRetrieveTextChunksTool } = await import('./retrieve-text-chunks-tool');

      const tool = buildRetrieveTextChunksTool({
        user,
        relatedFileEntities,
        sourceUrls: [],
        attachedLinks: [],
      });

      const result = await tool!.handler({ search: 'suche' });
      const parsed = result;

      expect(parsed.chunks).toEqual([]);
      expect(parsed.error).toBe('No matching chunks found.');
    });
  });
});
