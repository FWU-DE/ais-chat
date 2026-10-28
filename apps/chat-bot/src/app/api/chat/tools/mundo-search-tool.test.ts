import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MundoSearchResult } from '../mundo-search';
import { MUNDO_SEARCH_QUERY_LENGTH_LIMIT } from '@/configuration-text-inputs/const';

const mocks = vi.hoisted(() => ({
  mundoSearchMock: vi.fn(),
}));

vi.mock(import('../mundo-search'), async (importOriginal) => ({
  ...(await importOriginal()),
  mundoSearch: mocks.mundoSearchMock,
}));

const sampleResult: MundoSearchResult = {
  title: 'Photosynthese',
  description: 'Video.',
  learnResourceType: ['VIDEO'],
  language: ['Deutsch'],
  url: 'https://mundo.schule/details/SODIX-1',
  source: 'ARD',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildMundoSearchTool', () => {
  it('exposes a tool definition with required query, classLevel and subject parameters', async () => {
    const { buildMundoSearchTool } = await import('./mundo-search-tool');
    const tool = buildMundoSearchTool();

    expect(tool.definition.name).toBe('mundo_search');
    expect(tool.definition.parameters).toMatchObject({
      required: ['query', 'classLevel', 'subject'],
    });
  });

  it('forwards the query without filters when classLevel and subject are omitted', async () => {
    mocks.mundoSearchMock.mockResolvedValueOnce([sampleResult]);

    const { buildMundoSearchTool } = await import('./mundo-search-tool');
    const tool = buildMundoSearchTool();

    const raw = await tool.handler({ query: 'Photosynthese' });

    expect(mocks.mundoSearchMock).toHaveBeenCalledTimes(1);
    expect(mocks.mundoSearchMock).toHaveBeenCalledWith({
      query: 'Photosynthese',
      classLevel: undefined,
      subject: undefined,
    });
    expect(raw).toEqual({
      results: [sampleResult],
      retriedWithoutFilters: false,
    });
  });

  it('forwards classLevel and subject filters to mundoSearch', async () => {
    mocks.mundoSearchMock.mockResolvedValueOnce([sampleResult]);

    const { buildMundoSearchTool } = await import('./mundo-search-tool');
    const tool = buildMundoSearchTool();

    await tool.handler({
      query: 'Photosynthese',
      classLevel: '5-10',
      subject: 'Biologie',
    });

    expect(mocks.mundoSearchMock).toHaveBeenCalledTimes(1);
    expect(mocks.mundoSearchMock).toHaveBeenCalledWith({
      query: 'Photosynthese',
      classLevel: '5-10',
      subject: 'Biologie',
    });
  });

  it('treats null classLevel and subject as no filters and does not retry', async () => {
    mocks.mundoSearchMock.mockResolvedValueOnce([]);

    const { buildMundoSearchTool } = await import('./mundo-search-tool');
    const tool = buildMundoSearchTool();

    const raw = await tool.handler({
      query: 'Photosynthese',
      classLevel: null,
      subject: null,
    });

    expect(mocks.mundoSearchMock).toHaveBeenCalledTimes(1);
    expect(raw).toEqual({
      results: [],
      retriedWithoutFilters: false,
    });
  });

  it('drops invalid filter values and does not retry when no valid filter remains', async () => {
    mocks.mundoSearchMock.mockResolvedValueOnce([]);

    const { buildMundoSearchTool } = await import('./mundo-search-tool');
    const tool = buildMundoSearchTool();

    const raw = await tool.handler({
      query: 'Photosynthese',
      classLevel: 'not-a-range',
      subject: 'Astrophysik',
    });

    expect(mocks.mundoSearchMock).toHaveBeenCalledTimes(1);
    expect(mocks.mundoSearchMock).toHaveBeenCalledWith({
      query: 'Photosynthese',
      classLevel: undefined,
      subject: undefined,
    });
    expect(raw).toEqual({
      results: [],
      retriedWithoutFilters: false,
    });
  });

  it('retries without filters and reports retriedWithoutFilters when a filtered search returns nothing', async () => {
    mocks.mundoSearchMock.mockResolvedValueOnce([]).mockResolvedValueOnce([sampleResult]);

    const { buildMundoSearchTool } = await import('./mundo-search-tool');
    const tool = buildMundoSearchTool();

    const raw = await tool.handler({
      query: 'Photosynthese',
      classLevel: '5-10',
      subject: 'Biologie',
    });

    expect(mocks.mundoSearchMock).toHaveBeenCalledTimes(2);
    expect(mocks.mundoSearchMock).toHaveBeenNthCalledWith(1, {
      query: 'Photosynthese',
      classLevel: '5-10',
      subject: 'Biologie',
    });
    expect(mocks.mundoSearchMock).toHaveBeenNthCalledWith(2, { query: 'Photosynthese' });
    expect(raw).toEqual({
      results: [sampleResult],
      retriedWithoutFilters: true,
    });
  });

  it('reports retriedWithoutFilters even when the retry also returns no results', async () => {
    mocks.mundoSearchMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { buildMundoSearchTool } = await import('./mundo-search-tool');
    const tool = buildMundoSearchTool();

    const raw = await tool.handler({
      query: 'Photosynthese',
      classLevel: '5-10',
      subject: null,
    });

    expect(mocks.mundoSearchMock).toHaveBeenCalledTimes(2);
    expect(raw).toEqual({
      results: [],
      retriedWithoutFilters: true,
    });
  });

  it('returns an error when the query is empty and does not call mundoSearch', async () => {
    const { buildMundoSearchTool } = await import('./mundo-search-tool');
    const tool = buildMundoSearchTool();

    const raw = await tool.handler({ query: '   ' });

    expect(mocks.mundoSearchMock).not.toHaveBeenCalled();
    expect(raw).toEqual({ error: 'Invalid search query or filters.' });
  });

  it('truncates the query to MUNDO_SEARCH_QUERY_LENGTH_LIMIT before calling mundoSearch', async () => {
    mocks.mundoSearchMock.mockResolvedValueOnce([sampleResult]);

    const { buildMundoSearchTool } = await import('./mundo-search-tool');
    const tool = buildMundoSearchTool();

    const longQuery = 'a'.repeat(MUNDO_SEARCH_QUERY_LENGTH_LIMIT + 50);
    await tool.handler({ query: longQuery });

    expect(mocks.mundoSearchMock).toHaveBeenCalledWith({
      query: 'a'.repeat(MUNDO_SEARCH_QUERY_LENGTH_LIMIT),
      classLevel: undefined,
      subject: undefined,
    });
  });

  it('returns a generic error without leaking internal details when mundoSearch throws', async () => {
    mocks.mundoSearchMock.mockRejectedValueOnce(new Error('MUNDO is down'));

    const { buildMundoSearchTool } = await import('./mundo-search-tool');
    const tool = buildMundoSearchTool();

    const raw = await tool.handler({ query: 'Photosynthese' });

    expect(raw).toEqual({ error: 'MUNDO search failed.' });
  });
});

describe('mundoSearchActivity', () => {
  it('createStep sets detail to the parsed query for valid arguments', async () => {
    const { mundoSearchActivity } = await import('./mundo-search-tool');

    const step = mundoSearchActivity.createStep({
      id: 'call-1',
      name: 'mundo_search',
      arguments: JSON.stringify({ query: 'Photosynthese' }),
    });

    expect(step).toEqual({
      kind: 'tool',
      id: 'call-1',
      tool: 'mundo_search',
      detail: 'Photosynthese',
    });
  });

  it('createStep leaves detail undefined for invalid arguments', async () => {
    const { mundoSearchActivity } = await import('./mundo-search-tool');

    const step = mundoSearchActivity.createStep({
      id: 'call-1',
      name: 'mundo_search',
      arguments: JSON.stringify({ query: '' }),
    });

    expect(step.detail).toBeUndefined();
  });

  it('applyResult adds links derived from the results', async () => {
    const { mundoSearchActivity } = await import('./mundo-search-tool');

    const step = { kind: 'tool', id: 'call-1', tool: 'mundo_search' } as const;
    const result = mundoSearchActivity.applyResult!(step, {
      results: [sampleResult],
      retriedWithoutFilters: false,
    });

    expect(result.links).toEqual([{ title: sampleResult.title, url: sampleResult.url }]);
  });

  it('applyResult leaves the step unchanged when no links can be derived', async () => {
    const { mundoSearchActivity } = await import('./mundo-search-tool');

    const step = { kind: 'tool', id: 'call-1', tool: 'mundo_search' } as const;
    const result = mundoSearchActivity.applyResult!(step, {
      results: [],
      retriedWithoutFilters: false,
    });

    expect(result).toEqual(step);
  });

  it('parsePersistedResult passes a persisted success result through unchanged', async () => {
    const { mundoSearchActivity } = await import('./mundo-search-tool');

    const raw = { results: [sampleResult], retriedWithoutFilters: false };
    expect(mundoSearchActivity.parsePersistedResult(raw)).toEqual(raw);
  });
});
