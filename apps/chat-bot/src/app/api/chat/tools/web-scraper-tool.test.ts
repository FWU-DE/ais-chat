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
        error: null,
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
        title: null,
        url: 'http://localhost:3000/test',
        content: null,
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
        title: null,
        url: 'http://192.168.1.1/test',
        content: null,
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
        error: null,
      },
      {
        title: 'Page 2',
        url: 'https://example.com/page2',
        content: 'Content 2',
        error: null,
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

    expect(result).toContain('Maximum 5 URLs allowed');
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
        error: null,
      },
      {
        title: 'Zweite Seite',
        url: 'https://example.com/page2',
        content: 'Inhalt der zweiten Seite.',
        error: null,
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
        error: null,
      },
      {
        title: null,
        url: 'https://example.com/failure',
        content: null,
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

    expect(result).toBe('Error: Maximum 5 URLs allowed per call.');
  });
});
