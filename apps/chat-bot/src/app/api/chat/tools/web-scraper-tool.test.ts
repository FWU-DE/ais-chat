import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  webScraperMock: vi.fn(),
}));

vi.mock('../../web-scraper/web-scraper', () => ({
  webScraper: mocks.webScraperMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.webScraperMock.mockResolvedValue({
    name: 'Beispielseite',
    link: 'https://example.com/article',
    content: 'Das ist der extrahierte Inhalt.',
  });
});

describe('buildWebScraperTool', () => {
  it('adds a web scraper tool and returns scraped page content', async () => {
    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: [],
      attachedLinks: [],
    });

    expect(tool).not.toBeNull();
    expect(tool!.definition).toMatchObject({
      name: 'web_scraper',
    });
    expect(tool!.definition.description).toContain('one or more URLs');
    expect(tool!.definition.parameters).toMatchObject({
      required: ['urls'],
      properties: {
        urls: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
    });

    const result = await tool!.handler({
      urls: ['https://example.com/article'],
    });

    expect(mocks.webScraperMock).toHaveBeenCalledWith('https://example.com/article');
    expect(result).toEqual([
      {
        title: 'Beispielseite',
        url: 'https://example.com/article',
        content: 'Das ist der extrahierte Inhalt.',
      },
    ]);
  });

  it('includes attached source URLs in the description', async () => {
    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: ['https://example.com/doc1', 'https://example.com/doc2'],
      attachedLinks: [],
    });

    expect(tool!.definition.description).toContain('https://example.com/doc1');
    expect(tool!.definition.description).toContain('https://example.com/doc2');
  });

  it('validates URLs and rejects localhost', async () => {
    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: [],
      attachedLinks: [],
    });

    const result = await tool!.handler({
      urls: ['http://localhost:3000/test'],
    });

    expect(result).toEqual([
      {
        url: 'http://localhost:3000/test',
        error: 'Error: Only domain hosts are allowed.',
      },
    ]);
    expect(mocks.webScraperMock).not.toHaveBeenCalled();
  });

  it('validates URLs and rejects IP addresses', async () => {
    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: [],
      attachedLinks: [],
    });

    const result = await tool!.handler({
      urls: ['http://192.168.1.1/test'],
    });

    expect(result).toEqual([
      {
        url: 'http://192.168.1.1/test',
        error: 'Error: Only domain hosts are allowed.',
      },
    ]);
    expect(mocks.webScraperMock).not.toHaveBeenCalled();
  });

  it('handles multiple URLs in a single call', async () => {
    mocks.webScraperMock
      .mockResolvedValueOnce({
        name: 'Page 1',
        link: 'https://example.com/page1',
        content: 'Content 1',
      })
      .mockResolvedValueOnce({
        name: 'Page 2',
        link: 'https://example.com/page2',
        content: 'Content 2',
      });

    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: [],
      attachedLinks: [],
    });

    const result = await tool!.handler({
      urls: ['https://example.com/page1', 'https://example.com/page2'],
    });

    expect(result).toEqual([
      {
        title: 'Page 1',
        url: 'https://example.com/page1',
        content: 'Content 1',
      },
      {
        title: 'Page 2',
        url: 'https://example.com/page2',
        content: 'Content 2',
      },
    ]);
    expect(mocks.webScraperMock).toHaveBeenCalledTimes(2);
  });

  it('enforces maximum URL limit', async () => {
    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: [],
      attachedLinks: [],
    });

    const result = await tool!.handler({
      urls: Array.from({ length: 10 }, (_, i) => `https://example.com/page${i}`),
    });

    expect(result).toEqual({ error: expect.stringContaining('Maximum 5 URLs allowed') });
    expect(mocks.webScraperMock).not.toHaveBeenCalled();
  });

  it('handles multiple URLs and returns multiple results', async () => {
    mocks.webScraperMock
      .mockResolvedValueOnce({
        name: 'Erste Seite',
        link: 'https://example.com/page1',
        content: 'Inhalt der ersten Seite.',
      })
      .mockResolvedValueOnce({
        name: 'Zweite Seite',
        link: 'https://example.com/page2',
        content: 'Inhalt der zweiten Seite.',
      });

    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: [],
      attachedLinks: [],
    });

    const result = await tool!.handler({
      urls: ['https://example.com/page1', 'https://example.com/page2'],
    });

    expect(result).toEqual([
      {
        title: 'Erste Seite',
        url: 'https://example.com/page1',
        content: 'Inhalt der ersten Seite.',
      },
      {
        title: 'Zweite Seite',
        url: 'https://example.com/page2',
        content: 'Inhalt der zweiten Seite.',
      },
    ]);
  });

  it('handles mixed success and failure with per-URL error results', async () => {
    mocks.webScraperMock
      .mockResolvedValueOnce({
        name: 'Erfolgreiche Seite',
        link: 'https://example.com/success',
        content: 'Erfolgreicher Inhalt.',
      })
      .mockResolvedValueOnce({
        link: 'https://example.com/failure',
        error: true,
      });

    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: [],
      attachedLinks: [],
    });

    const result = await tool!.handler({
      urls: ['https://example.com/success', 'https://example.com/failure'],
    });

    expect(result).toEqual([
      {
        title: 'Erfolgreiche Seite',
        url: 'https://example.com/success',
        content: 'Erfolgreicher Inhalt.',
      },
      {
        url: 'https://example.com/failure',
        error: 'Failed to fetch the page.',
      },
    ]);
  });

  it('returns error when more than max URLs provided', async () => {
    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: [],
      attachedLinks: [],
    });

    const result = await tool!.handler({
      urls: Array(6).fill('https://example.com'),
    });

    expect(result).toEqual({ error: 'Maximum 5 URLs allowed per call.' });
  });

  it('returns an empty URL error for a whitespace-only entry, without failing the whole call', async () => {
    mocks.webScraperMock.mockResolvedValueOnce({
      name: 'Example Page',
      link: 'https://example.com',
      content: 'This is the extracted content.',
    });

    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: [],
      attachedLinks: [],
    });

    const result = await tool!.handler({
      urls: ['https://example.com', '   '],
    });

    expect(result).toEqual([
      {
        title: 'Example Page',
        url: 'https://example.com',
        content: 'This is the extracted content.',
      },
      {
        error: 'Empty URL.',
      },
    ]);
  });

  it('returns an error for an empty urls array without calling webScraper', async () => {
    const { buildWebScraperTool } = await import('./web-scraper-tool');

    const tool = buildWebScraperTool({
      characterId: undefined,
      learningScenarioId: undefined,
      sourceUrls: [],
      attachedLinks: [],
    });

    const result = await tool!.handler({ urls: [] });

    expect(result).toEqual({ error: 'Missing URLs.' });
    expect(mocks.webScraperMock).not.toHaveBeenCalled();
  });
});
