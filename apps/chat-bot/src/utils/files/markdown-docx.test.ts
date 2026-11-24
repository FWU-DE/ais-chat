import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderPlotImageMock, waitForPlotActivationMock, activateLivePlotsMock, restoreMock } =
  vi.hoisted(() => ({
    renderPlotImageMock: vi.fn(),
    waitForPlotActivationMock: vi.fn(),
    activateLivePlotsMock: vi.fn(),
    restoreMock: vi.fn(),
  }));

vi.mock('./plot-image', () => ({
  renderPlotImage: renderPlotImageMock,
  waitForPlotActivation: waitForPlotActivationMock,
}));
vi.mock('@/components/chat/plot/live-plots', () => ({
  activateLivePlots: activateLivePlotsMock,
}));
vi.mock('@/utils/files/document-images', () => ({
  loadDocumentImage: vi.fn(),
}));

const { markdownToDocxBlob } = await import('./markdown-docx');

async function convert(markdown: string[]) {
  const blob = await markdownToDocxBlob({ markdownBlocks: markdown.map((m) => ({ markdown: m })) });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { blob, bytes };
}

describe('markdownToDocxBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activateLivePlotsMock.mockReturnValue(restoreMock);
    waitForPlotActivationMock.mockResolvedValue(undefined);
  });

  it('creates a docx archive with the word mime type', async () => {
    const { blob, bytes } = await convert(['# Titel\n\nEin Absatz mit **fett**.']);

    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
  });

  it('renders tables, lists, code blocks, math, html breaks and thematic breaks', async () => {
    const { bytes } = await convert([
      '| A | B |\n| --- | --- |\n| 1 | 2 |',
      '1. eins\n2. zwei\n\n- [x] erledigt\n- [ ] offen',
      '```ts title="beispiel.ts"\nconst x = 1;\n```',
      '```\nohne Sprache\n```',
      'Formel $a^2 + b^2 = c^2$\n\n$$\\frac{1}{2}$$',
      'Zeile<br>Umbruch',
      '---',
      '→ ☐ ☑ Sonderzeichen',
    ]);

    expect(bytes.length).toBeGreaterThan(0);
  });

  it('does not activate plots when the document has none', async () => {
    await convert(['Nur Text']);

    expect(activateLivePlotsMock).not.toHaveBeenCalled();
    expect(waitForPlotActivationMock).not.toHaveBeenCalled();
  });

  it('renders valid plot blocks as images and restores live plots', async () => {
    renderPlotImageMock.mockResolvedValue(undefined);

    await convert(['```jsxgraph-json\n{"elements":[["point",[0,0]]]}\n```']);

    expect(activateLivePlotsMock).toHaveBeenCalledTimes(1);
    expect(waitForPlotActivationMock).toHaveBeenCalledTimes(1);
    expect(renderPlotImageMock).toHaveBeenCalledTimes(1);
    expect(restoreMock).toHaveBeenCalledTimes(1);
  });

  it('renders a plot image into the document', async () => {
    const pngBytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      ),
      (char) => char.charCodeAt(0),
    );
    renderPlotImageMock.mockResolvedValue({ data: pngBytes, width: 1, height: 1 });

    const { bytes } = await convert(['```jsxgraph-json\n{"elements":[["point",[0,0]]]}\n```']);

    expect(bytes.length).toBeGreaterThan(0);
    expect(restoreMock).toHaveBeenCalledTimes(1);
  });

  it('restores live plots even when conversion fails', async () => {
    waitForPlotActivationMock.mockRejectedValue(new Error('boom'));

    await expect(
      convert(['```jsxgraph-json\n{"elements":[["point",[0,0]]]}\n```']),
    ).rejects.toThrow('boom');
    expect(restoreMock).toHaveBeenCalledTimes(1);
  });

  it('keeps invalid plot blocks as code without activating plots', async () => {
    await convert(['```jsxgraph-json\n{not json\n```']);

    expect(activateLivePlotsMock).not.toHaveBeenCalled();
  });
});
