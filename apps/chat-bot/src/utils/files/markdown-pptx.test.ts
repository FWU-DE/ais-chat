import { beforeEach, describe, expect, it, vi } from 'vitest';

type TextCall = { text: unknown; options: Record<string, unknown> };
type ImageCall = Record<string, unknown>;
type TableCall = { rows: unknown[][]; options: Record<string, unknown> };
type FakeSlide = {
  masterName?: string;
  texts: TextCall[];
  images: ImageCall[];
  tables: TableCall[];
  shapes: { type: unknown; options: Record<string, unknown> }[];
};

const mocks = vi.hoisted(() => ({
  slides: [] as unknown[],
  presentation: { layout: '', title: '', masters: [] as string[] },
  loadDocumentImage: vi.fn(),
  restoreLivePlots: vi.fn(),
  activateLivePlots: vi.fn(),
  renderPlotImage: vi.fn(),
}));

vi.mock('pptxgenjs', () => ({
  default: class {
    set layout(value: string) {
      mocks.presentation.layout = value;
    }
    set title(value: string) {
      mocks.presentation.title = value;
    }
    defineSlideMaster({ title }: { title: string }) {
      mocks.presentation.masters.push(title);
    }
    ShapeType = { rect: 'rect' };
    addSlide({ masterName }: { masterName?: string } = {}) {
      const slide = {
        masterName,
        texts: [] as unknown[],
        images: [] as unknown[],
        tables: [] as unknown[],
        shapes: [] as unknown[],
        addText: (text: unknown, options: unknown) => slide.texts.push({ text, options }),
        addImage: (options: unknown) => slide.images.push(options),
        addTable: (rows: unknown, options: unknown) => slide.tables.push({ rows, options }),
        addShape: (type: unknown, options: unknown) => slide.shapes.push({ type, options }),
      };
      mocks.slides.push(slide);
      return slide;
    }
    write() {
      return Promise.resolve(new Uint8Array([80, 75]).buffer);
    }
  },
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

import { markdownToPptxBlob } from './markdown-pptx';

const PLOT = '{"elements":[["point",[0,0]]]}';

function slides() {
  return mocks.slides as FakeSlide[];
}

function runsOf(call: TextCall | undefined) {
  return call === undefined ? [] : (call.text as { text: string; options: object }[]);
}

function plainText(call: TextCall | undefined) {
  return typeof call?.text === 'string'
    ? call.text
    : runsOf(call)
        .map(({ text }) => text)
        .join('');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.slides.length = 0;
  mocks.presentation.masters.length = 0;
  mocks.activateLivePlots.mockReturnValue(mocks.restoreLivePlots);
  mocks.loadDocumentImage.mockResolvedValue({
    data: new Uint8Array([1, 2, 3]).buffer,
    mimeType: 'image/png',
    width: 400,
    height: 200,
  });
  mocks.renderPlotImage.mockResolvedValue({
    data: new Uint8Array([4, 5, 6]).buffer,
    width: 300,
    height: 300,
  });
});

describe('markdownToPptxBlob', () => {
  it('returns a PPTX blob for a wide presentation with the given title', async () => {
    const blob = await markdownToPptxBlob('# Folie', undefined, 'Mein Titel');

    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(mocks.presentation).toMatchObject({ layout: 'LAYOUT_WIDE', title: 'Mein Titel' });
  });

  it('applies the classic design by default and the requested design otherwise', async () => {
    await markdownToPptxBlob('# Titel\n\nUntertitel\n\n## Inhalt\n\nText');

    expect(mocks.presentation.masters).toEqual(['classic-content', 'classic-title']);
    expect(slides().map(({ masterName }) => masterName)).toEqual([
      'classic-title',
      'classic-content',
    ]);

    mocks.slides.length = 0;
    mocks.presentation.masters.length = 0;
    await markdownToPptxBlob('## Inhalt\n\nText', undefined, 'Test', 'dark');

    expect(mocks.presentation.masters).toEqual(['dark-content', 'dark-title']);
    expect(slides()[0]?.masterName).toBe('dark-content');
    expect(slides()[0]?.texts[0]?.options).toMatchObject({ color: 'FFFFFF' });
  });

  it('uses the opening heading and its single paragraph as title slide with subtitle', async () => {
    await markdownToPptxBlob('# Titel\n\nUntertitel');

    expect(slides()).toHaveLength(1);
    expect(slides()[0]?.texts.map(plainText)).toEqual(['Titel', 'Untertitel']);
    expect(slides()[0]?.texts[0]?.options).toMatchObject({ align: 'center', fontSize: 44 });
  });

  it('starts a new slide for level 1 and 2 headings and for thematic breaks', async () => {
    await markdownToPptxBlob(
      '# Titel\n\nText A\n\nText A2\n\n## Zweite\n\nText B\n\n---\n\nText C\n\n### Unter',
    );

    expect(slides()).toHaveLength(3);
    expect(plainText(slides()[0]?.texts[0])).toBe('Titel');
    expect(plainText(slides()[0]?.texts[1])).toBe('Text A');
    expect(plainText(slides()[1]?.texts[0])).toBe('Zweite');
    expect(plainText(slides()[1]?.texts[1])).toBe('Text B');
    expect(slides()[2]?.texts.map(plainText)).toEqual(['Text C', 'Unter']);
  });

  it('centers a heading without content as a title slide', async () => {
    await markdownToPptxBlob('# Nur Titel');

    expect(slides()).toHaveLength(1);
    expect(slides()[0]?.texts[0]?.options).toMatchObject({ align: 'center', fontSize: 44 });
  });

  it('renders nested and ordered lists as bullets', async () => {
    await markdownToPptxBlob('## Liste\n\n- Eins\n  - Innen\n- Zwei\n\n3. Drei\n4. Vier');

    const runs = slides()[0]?.texts.slice(1).flatMap(runsOf) ?? [];
    expect(runs.map(({ text }) => text)).toEqual(['Eins', 'Innen', 'Zwei', 'Drei', 'Vier']);
    expect(runs[0]?.options).toMatchObject({ bullet: true, indentLevel: 0 });
    expect(runs[1]?.options).toMatchObject({ bullet: true, indentLevel: 1 });
    expect(runs[3]?.options).toMatchObject({ bullet: { type: 'number', numberStartAt: 3 } });
    expect(runs[4]?.options).toMatchObject({ bullet: { type: 'number', numberStartAt: 4 } });
  });

  it('keeps inline formatting, links and formulas as text runs', async () => {
    await markdownToPptxBlob('## S\n\n**fett** *kursiv* `code` [Link](https://example.com) $x^2$');

    const runs = runsOf(slides()[0]?.texts[1]);
    expect(runs.map(({ text }) => text)).toEqual([
      'fett',
      ' ',
      'kursiv',
      ' ',
      'code',
      ' ',
      'Link',
      ' ',
      'x^2',
    ]);
    expect(runs[0]?.options).toMatchObject({ bold: true });
    expect(runs[2]?.options).toMatchObject({ italic: true });
    expect(runs[4]?.options).toMatchObject({ fontFace: 'Courier New' });
    expect(runs[6]?.options).toMatchObject({ hyperlink: { url: 'https://example.com' } });
    expect(runs[8]?.options).toMatchObject({ italic: true });
  });

  it('renders display formulas and code blocks as text boxes', async () => {
    await markdownToPptxBlob('## S\n\n$$\na^2+b^2=c^2\n$$\n\n```ts\nconst a = 1;\n```');

    expect(slides()[0]?.texts.slice(1).map(plainText)).toEqual(['a^2+b^2=c^2', 'const a = 1;']);
    expect(slides()[0]?.texts[2]?.options).toMatchObject({ fill: { color: 'F3F4F6' } });
  });

  it('renders GFM tables with a bold header row', async () => {
    await markdownToPptxBlob('## T\n\n| A | B |\n| --- | :-: |\n| 1 | 2 |');

    const table = slides()[0]?.tables[0];
    expect(table?.rows).toEqual([
      [
        { text: 'A', options: { color: 'FFFFFF', bold: true, fill: { color: '1E3A8A' } } },
        {
          text: 'B',
          options: { color: 'FFFFFF', bold: true, fill: { color: '1E3A8A' }, align: 'center' },
        },
      ],
      [
        { text: '1', options: { color: '1F2937' } },
        { text: '2', options: { color: '1F2937', align: 'center' } },
      ],
    ]);
  });

  it('continues long tables on a further slide with a repeated header', async () => {
    const rows = Array.from({ length: 40 }, (_, index) => `| z${index} | w |`).join('\n');
    await markdownToPptxBlob(`## T\n\n| A | B |\n| --- | --- |\n${rows}`);

    expect(slides().length).toBeGreaterThan(1);
    slides().forEach((slide) => {
      expect(plainText(slide.texts[0])).toBe('T');
      expect(slide.tables[0]?.rows[0]).toMatchObject([{ text: 'A' }, { text: 'B' }]);
    });
  });

  it('moves content that does not fit to a continuation slide with the same title', async () => {
    const paragraphs = Array.from({ length: 30 }, (_, index) => `Absatz ${index}`).join('\n\n');
    await markdownToPptxBlob(`## Viel\n\n${paragraphs}`);

    expect(slides().length).toBeGreaterThan(1);
    slides().forEach((slide) => expect(plainText(slide.texts[0])).toBe('Viel'));
  });

  it('embeds only referenced uploads, scaled to the slide', async () => {
    await markdownToPptxBlob(
      '## Bild\n\n![Foto](attachment://a)',
      new Map([
        ['attachment://a', '/files/a'],
        ['attachment://unused', '/files/unused'],
      ]),
    );

    expect(mocks.loadDocumentImage).toHaveBeenCalledTimes(1);
    expect(mocks.loadDocumentImage).toHaveBeenCalledWith('/files/a', 1000);
    const image = slides()[0]?.images[0] as { data: string; w: number; h: number };
    expect(image.data).toBe('image/png;base64,AQID');
    expect(image.w / image.h).toBeCloseTo(2);
    expect(image.h).toBeLessThanOrEqual(4.5);
  });

  it('uses an image below the opening heading as full-bleed cover background', async () => {
    await markdownToPptxBlob(
      '# Klimawandel\n\n![Erde](attachment://a)\n\nUntertitel\n\n## Ursachen\n\nText',
      new Map([['attachment://a', '/files/a']]),
    );

    expect(slides()).toHaveLength(2);
    const cover = slides()[0];
    expect(cover?.masterName).toBe('classic-title');
    expect(cover?.images[0]).toMatchObject({
      x: 0,
      y: 0,
      sizing: { type: 'cover', w: 13.33, h: 7.5 },
    });
    expect(cover?.shapes).toHaveLength(1);
    expect(cover?.texts.map(plainText)).toEqual(['Klimawandel', 'Untertitel']);
    expect(cover?.texts[0]?.options).toMatchObject({ color: 'FFFFFF' });
    expect(slides()[1]?.images).toEqual([]);
  });

  it('keeps an image as normal content when the opening slide has more text', async () => {
    await markdownToPptxBlob(
      '# Titel\n\nEins\n\nZwei\n\n![Erde](attachment://a)',
      new Map([['attachment://a', '/files/a']]),
    );

    expect(slides()[0]?.masterName).toBe('classic-content');
    expect(slides().flatMap(({ shapes }) => shapes)).toEqual([]);
    expect(slides().flatMap(({ images }) => images)).toHaveLength(1);
  });

  it('ignores images without an upload reference', async () => {
    await markdownToPptxBlob('## Bild\n\n![Foto](https://example.com/a.png)');

    expect(mocks.loadDocumentImage).not.toHaveBeenCalled();
    expect(slides()[0]?.images).toEqual([]);
  });

  it('renders valid plots as images and restores live plots', async () => {
    await markdownToPptxBlob(`## Plot\n\n\`\`\`jsxgraph-json\n${PLOT}\n\`\`\``);

    const image = slides()[0]?.images[0] as { data: string; w: number; h: number };
    expect(image.data).toBe('image/png;base64,BAUG');
    expect(image.w).toBeCloseTo(image.h);
    expect(mocks.restoreLivePlots).toHaveBeenCalledOnce();
  });

  it('renders invalid plot JSON as a code block', async () => {
    await markdownToPptxBlob('## Plot\n\n```jsxgraph-json\nnot json\n```');

    expect(mocks.renderPlotImage).not.toHaveBeenCalled();
    expect(slides()[0]?.images).toEqual([]);
    expect(plainText(slides()[0]?.texts[1])).toBe('not json');
  });
});
