import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadDocumentImage: vi.fn(),
  restoreLivePlots: vi.fn(),
  activateLivePlots: vi.fn(),
  renderPlotImage: vi.fn(),
}));

vi.mock('./document-images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./document-images')>()),
  loadDocumentImage: mocks.loadDocumentImage,
}));
vi.mock('@/components/chat/plot/live-plots', () => ({
  activateLivePlots: mocks.activateLivePlots,
}));
vi.mock('@/components/chat/plot/rendered-plots', () => ({ getPlotKey: () => 'plot-key' }));
vi.mock('./plot-image', () => ({
  renderPlotImage: mocks.renderPlotImage,
  waitForPlotActivation: vi.fn().mockResolvedValue(undefined),
}));

import { markdownToPdfBlob } from './markdown-pdf';

const PLOT = '{"elements":[["point",[0,0]]]}';

function mockFetch() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('%PDF-test', { status: 200 }));
}

function sentBody(fetchSpy: ReturnType<typeof mockFetch>) {
  return JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activateLivePlots.mockReturnValue(mocks.restoreLivePlots);
  mocks.loadDocumentImage.mockResolvedValue({
    data: new Uint8Array([1, 2, 3]).buffer,
    mimeType: 'image/png',
  });
  mocks.renderPlotImage.mockResolvedValue({ data: new Uint8Array([4, 5, 6]).buffer });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('markdownToPdfBlob', () => {
  it('sends Markdown and title to the PDF route and returns the PDF', async () => {
    const fetchSpy = mockFetch();

    const blob = await markdownToPdfBlob('# Hallo', undefined, 'Titel');

    expect(await blob.text()).toBe('%PDF-test');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/generate-document/pdf');
    expect(sentBody(fetchSpy)).toEqual({
      markdown: '# Hallo',
      title: 'Titel',
      images: [],
      plots: [],
    });
  });

  it('uses the shared chat route and sends the shared chat context', async () => {
    const fetchSpy = mockFetch();
    const sharedChat = {
      inviteCode: 'invite',
      entityType: 'character' as const,
      entityId: 'character-1',
      sharedSessionId: 'session-1',
    };

    await markdownToPdfBlob('# Hallo', undefined, 'Titel', sharedChat);

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/v1/shared-chat/generate-document/pdf');
    expect(sentBody(fetchSpy)).toMatchObject(sharedChat);
  });

  it('only loads images that are referenced in the Markdown', async () => {
    const fetchSpy = mockFetch();
    const imageReferences = new Map([
      ['attachment://used', '/api/files/used/scaled-image'],
      ['attachment://reference', '/api/files/reference/scaled-image'],
      ['attachment://unused', '/api/files/unused/scaled-image'],
    ]);

    await markdownToPdfBlob(
      '![Foto](attachment://used)\n\n![Bild][ref]\n\n[ref]: attachment://reference',
      imageReferences,
    );

    expect(mocks.loadDocumentImage).toHaveBeenCalledTimes(2);
    expect(mocks.loadDocumentImage).not.toHaveBeenCalledWith('/api/files/unused/scaled-image');
    expect(sentBody(fetchSpy).images).toEqual([
      { source: 'attachment://used', mimeType: 'image/png', data: 'AQID' },
      { source: 'attachment://reference', mimeType: 'image/png', data: 'AQID' },
    ]);
  });

  it('renders each distinct valid plot once and restores the live plots', async () => {
    const fetchSpy = mockFetch();

    await markdownToPdfBlob(
      `\`\`\`jsxgraph-json\n${PLOT}\n\`\`\`\n\n\`\`\`jsxgraph-json\n${PLOT}\n\`\`\`\n\n\`\`\`jsxgraph-json\nnot json\n\`\`\``,
    );

    expect(mocks.renderPlotImage).toHaveBeenCalledTimes(1);
    expect(mocks.restoreLivePlots).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchSpy).plots).toEqual([{ code: PLOT, data: 'BAUG' }]);
  });

  it('limits the number of rendered plots', async () => {
    const fetchSpy = mockFetch();
    const blocks = Array.from(
      { length: 12 },
      (_, index) => `\`\`\`jsxgraph-json\n{"elements":[["point",[${index},0]]]}\n\`\`\``,
    );

    await markdownToPdfBlob(blocks.join('\n\n'));

    expect(sentBody(fetchSpy).plots).toHaveLength(10);
  });

  it('skips plots that could not be rendered and restores the live plots on errors', async () => {
    const fetchSpy = mockFetch();
    mocks.renderPlotImage.mockResolvedValue(undefined);

    await markdownToPdfBlob(`\`\`\`jsxgraph-json\n${PLOT}\n\`\`\``);

    expect(sentBody(fetchSpy).plots).toEqual([]);

    mocks.renderPlotImage.mockRejectedValue(new Error('render failed'));
    await expect(markdownToPdfBlob(`\`\`\`jsxgraph-json\n${PLOT}\n\`\`\``)).rejects.toThrow(
      'render failed',
    );
    expect(mocks.restoreLivePlots).toHaveBeenCalledTimes(2);
  });

  it('throws when the PDF route responds with an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));

    await expect(markdownToPdfBlob('# Hallo')).rejects.toThrow('PDF generation failed: 500');
  });
});
