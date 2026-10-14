import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MUNDO_SEARCH_RESULTS_LIMIT } from '@/configuration-text-inputs/const';

vi.mock('@shared/logging', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mundoSearch', () => {
  it('calls the MUNDO API with search and returns only the whitelisted fields', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tiles: [
          {
            id: 'internal-id',
            identifier: 'SODIX-0001159031',
            title: 'Photosynthese erklärt',
            description: 'Ein Erklärvideo zur Photosynthese.',
            learnResourceType: ['VIDEO'],
            language: ['Deutsch'],
            publishers: [{ name: 'ARD' }],
            classLevel: ['5', '10'],
            url: 'https://example.com/video.mp4',
          },
        ],
      }),
    });

    const { mundoSearch } = await import('./mundo-search');

    const results = await mundoSearch({ query: 'Photosynthese' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mundo.schule/api/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          search: 'Photosynthese',
          filters: { classLevels: [], subjects: [] },
          size: MUNDO_SEARCH_RESULTS_LIMIT,
        }),
      }),
    );

    expect(results).toEqual([
      {
        title: 'Photosynthese erklärt',
        description: 'Ein Erklärvideo zur Photosynthese.',
        learnResourceType: ['VIDEO'],
        language: ['Deutsch'],
        url: 'https://mundo.schule/details/SODIX-0001159031',
        source: '',
      },
    ]);
  });

  it('propagates an error when the API responds with a non-ok status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    });

    const { mundoSearch, MundoSearchError } = await import('./mundo-search');

    await expect(mundoSearch({ query: 'test' })).rejects.toBeInstanceOf(MundoSearchError);
  });

  it('returns an empty array when the API returns no tiles', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ tiles: [] }),
    });

    const { mundoSearch } = await import('./mundo-search');

    await expect(mundoSearch({ query: 'nichts hier' })).resolves.toEqual([]);
  });

  it('propagates errors from fetch instead of swallowing them', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const { mundoSearch, MundoSearchError } = await import('./mundo-search');

    await expect(mundoSearch({ query: 'test' })).rejects.toBeInstanceOf(MundoSearchError);
  });

  it('skips tiles without an identifier', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tiles: [
          {
            title: 'No identifier',
            description: 'A tile without an identifier.',
            learnResourceType: ['TEXT'],
            language: ['Deutsch'],
          },
          {
            identifier: '   ',
            title: 'Blank identifier',
          },
          {
            identifier: 'SODIX-A',
            title: 'Valid A',
          },
          {
            identifier: 'SODIX-B',
            title: 'Valid B',
          },
        ],
      }),
    });

    const { mundoSearch } = await import('./mundo-search');

    const results = await mundoSearch({ query: 'mixed' });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.url)).toEqual([
      'https://mundo.schule/details/SODIX-A',
      'https://mundo.schule/details/SODIX-B',
    ]);
  });
});
