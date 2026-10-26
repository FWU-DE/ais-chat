import PptxGenJS from 'pptxgenjs';
import type { DocumentBlock, DocumentImageResolver, SlideLayout } from './markdown-document';
import { parseMarkdownDocument, slideLayoutSchema } from './markdown-document';

const MAX_SLIDE_UNITS = 8;
const MAX_PARAGRAPH_LENGTH = 420;
const MAX_LIST_ITEMS = 6;
const MAX_TABLE_ROWS = 6;

export type PresentationSlide = {
  title: string;
  layout: SlideLayout;
  blocks: DocumentBlock[];
  continuation: boolean;
};

function chunkText(text: string, maximumLength: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    if (current !== '' && `${current} ${word}`.length > maximumLength) {
      chunks.push(current);
      current = word;
    } else {
      current = current === '' ? word : `${current} ${word}`;
    }
  }

  if (current !== '') {
    chunks.push(current);
  }
  return chunks;
}

function normalizeBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  const normalizedBlocks: DocumentBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      normalizedBlocks.push(
        ...chunkText(block.text, MAX_PARAGRAPH_LENGTH).map((text) => ({ ...block, text })),
      );
    } else if (block.type === 'code') {
      normalizedBlocks.push(
        ...chunkText(block.value, MAX_PARAGRAPH_LENGTH).map((value) => ({ ...block, value })),
      );
    } else if (block.type === 'list') {
      normalizedBlocks.push(
        ...Array.from({ length: Math.ceil(block.items.length / MAX_LIST_ITEMS) }, (_, index) => ({
          ...block,
          items: block.items.slice(index * MAX_LIST_ITEMS, (index + 1) * MAX_LIST_ITEMS),
        })),
      );
    } else if (block.type === 'table' && block.rows.length > MAX_TABLE_ROWS) {
      const [header = [], ...rows] = block.rows;
      normalizedBlocks.push(
        ...Array.from({ length: Math.ceil(rows.length / (MAX_TABLE_ROWS - 1)) }, (_, index) => ({
          ...block,
          rows: [
            header,
            ...rows.slice(index * (MAX_TABLE_ROWS - 1), (index + 1) * (MAX_TABLE_ROWS - 1)),
          ],
        })),
      );
    } else {
      normalizedBlocks.push(block);
    }
  }

  return normalizedBlocks;
}

function getBlockUnits(block: DocumentBlock): number {
  if (block.type === 'image') return 4;
  if (block.type === 'list') return Math.max(2, block.items.length);
  if (block.type === 'table') return Math.max(3, block.rows.length);
  if (block.type === 'page-break') return MAX_SLIDE_UNITS;
  return 2;
}

function paginateBlocks(blocks: DocumentBlock[]): DocumentBlock[][] {
  const pages: DocumentBlock[][] = [];
  let page: DocumentBlock[] = [];
  let units = 0;

  for (const block of normalizeBlocks(blocks)) {
    const blockUnits = getBlockUnits(block);
    if (page.length > 0 && (units + blockUnits > MAX_SLIDE_UNITS || block.type === 'page-break')) {
      pages.push(page);
      page = [];
      units = 0;
    }
    if (block.type !== 'page-break') {
      page.push(block);
      units += blockUnits;
    }
  }

  if (page.length > 0) {
    pages.push(page);
  }
  return pages.length === 0 ? [[]] : pages;
}

function extractLayout(title: string): { title: string; layout?: SlideLayout } {
  const match = title.match(/\s*\{layout=([a-z-]+)\}\s*$/);
  if (match === null) return { title };
  const parsedLayout = slideLayoutSchema.safeParse(match[1]);
  return {
    title: title.slice(0, match.index).trim(),
    layout: parsedLayout.success ? parsedLayout.data : undefined,
  };
}

function inferLayout(blocks: DocumentBlock[]): SlideLayout {
  return blocks.some((block) => block.type === 'image') ? 'image-right' : 'content';
}

export function buildPresentationSlides(markdown: string): PresentationSlide[] {
  const document = parseMarkdownDocument(markdown);
  const slides: PresentationSlide[] = [
    { title: document.title, layout: 'title', blocks: [], continuation: false },
  ];
  let sectionTitle = document.title;
  let explicitLayout: SlideLayout | undefined;
  let sectionBlocks: DocumentBlock[] = [];

  const flushSection = () => {
    if (sectionBlocks.length === 0) return;
    const pages = paginateBlocks(sectionBlocks);
    const layout = explicitLayout ?? inferLayout(sectionBlocks);
    slides.push(
      ...pages.map((blocks, index) => ({
        title: index === 0 ? sectionTitle : `${sectionTitle} (Fortsetzung)`,
        layout: index === 0 ? layout : inferLayout(blocks),
        blocks,
        continuation: index > 0,
      })),
    );
    sectionBlocks = [];
  };

  for (const block of document.blocks) {
    if (block.type === 'heading' && block.level === 2) {
      flushSection();
      const heading = extractLayout(block.text);
      sectionTitle = heading.title;
      explicitLayout = heading.layout;
    } else {
      sectionBlocks.push(block);
    }
  }
  flushSection();

  return slides;
}

function blocksToText(blocks: DocumentBlock[]): string {
  return blocks
    .flatMap((block) => {
      if (block.type === 'paragraph') return [block.text];
      if (block.type === 'heading') return [block.text];
      if (block.type === 'list') {
        return block.items.map((item, index) =>
          block.ordered ? `${index + 1}. ${item}` : `• ${item}`,
        );
      }
      if (block.type === 'code') return [block.value];
      return [];
    })
    .join('\n');
}

function getImageBox(
  image: { width: number; height: number },
  box: { x: number; y: number; w: number; h: number },
) {
  const scale = Math.min(box.w / image.width, box.h / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: box.x + (box.w - width) / 2,
    y: box.y + (box.h - height) / 2,
    w: width,
    h: height,
  };
}

async function renderContentSlide(
  pptx: PptxGenJS,
  slideModel: PresentationSlide,
  imageResolver: DocumentImageResolver | undefined,
) {
  const slide = pptx.addSlide();
  slide.background = { color: 'F8FAFC' };
  slide.addText(slideModel.title, {
    x: 0.7,
    y: 0.35,
    w: 11.9,
    h: 0.6,
    bold: true,
    color: '1F2933',
    fontFace: 'Aptos Display',
    fontSize: 25,
    margin: 0,
  });

  const images = slideModel.blocks.filter((block) => block.type === 'image');
  const textBlocks = slideModel.blocks.filter(
    (block) => block.type !== 'image' && block.type !== 'table',
  );
  const table = slideModel.blocks.find((block) => block.type === 'table');
  const text = blocksToText(textBlocks);

  let textBox = { x: 0.8, y: 1.3, w: 11.7, h: table === undefined ? 5.5 : 2.4 };
  let imageBox: { x: number; y: number; w: number; h: number } | undefined;

  if (slideModel.layout === 'image-left') {
    imageBox = { x: 0.8, y: 1.4, w: 5.5, h: 5.2 };
    textBox = { x: 6.8, y: 1.4, w: 5.7, h: 5.2 };
  } else if (slideModel.layout === 'image-right') {
    textBox = { x: 0.8, y: 1.4, w: 5.7, h: 5.2 };
    imageBox = { x: 6.9, y: 1.4, w: 5.5, h: 5.2 };
  }

  if (slideModel.layout === 'two-column') {
    const lines = text.split('\n');
    const midpoint = Math.ceil(lines.length / 2);
    slide.addText(lines.slice(0, midpoint).join('\n'), {
      x: 0.8,
      y: 1.4,
      w: 5.7,
      h: 5.2,
      breakLine: false,
      fontFace: 'Aptos',
      fontSize: 18,
      margin: 0.08,
      valign: 'top',
    });
    slide.addText(lines.slice(midpoint).join('\n'), {
      x: 6.8,
      y: 1.4,
      w: 5.7,
      h: 5.2,
      breakLine: false,
      fontFace: 'Aptos',
      fontSize: 18,
      margin: 0.08,
      valign: 'top',
    });
  } else if (text !== '') {
    slide.addText(text, {
      ...textBox,
      breakLine: false,
      color: '334E68',
      fontFace: 'Aptos',
      fontSize: 18,
      margin: 0.08,
      valign: 'top',
    });
  }

  if (table?.type === 'table') {
    slide.addTable(
      table.rows.map((row) => row.map((text) => ({ text }))),
      {
        x: 0.8,
        y: 4,
        w: 11.7,
        border: { color: '9FB3C8', pt: 1 },
        color: '243B53',
        fill: { color: 'FFFFFF' },
        fontFace: 'Aptos',
        fontSize: 13,
        margin: 0.06,
        rowH: 0.4,
      },
    );
  }

  if (imageBox !== undefined && images[0]?.type === 'image') {
    if (imageResolver === undefined) {
      throw new Error(`No image resolver configured for ${images[0].source}`);
    }
    const image = await imageResolver(images[0].source);
    slide.addImage({
      data: `data:${image.mimeType};base64,${Buffer.from(image.data).toString('base64')}`,
      ...getImageBox(image, imageBox),
    });
  }
}

export async function renderMarkdownPptx(
  markdown: string,
  { imageResolver }: { imageResolver?: DocumentImageResolver } = {},
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'AIS.chat';
  pptx.subject = 'Generated presentation';
  pptx.title = parseMarkdownDocument(markdown).title;
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  };

  for (const slideModel of buildPresentationSlides(markdown)) {
    if (slideModel.layout === 'title') {
      const slide = pptx.addSlide();
      slide.background = { color: '0B7285' };
      slide.addText(slideModel.title, {
        x: 1,
        y: 2.6,
        w: 11.3,
        h: 1.1,
        align: 'center',
        bold: true,
        color: 'FFFFFF',
        fontFace: 'Aptos Display',
        fontSize: 34,
        margin: 0,
      });
    } else {
      await renderContentSlide(pptx, slideModel, imageResolver);
    }
  }

  const output = await pptx.write({ compression: true, outputType: 'nodebuffer' });
  if (typeof output === 'string' || output instanceof Blob) {
    throw new Error('PptxGenJS returned an unexpected output type');
  }
  return Buffer.from(output instanceof ArrayBuffer ? new Uint8Array(output) : output);
}
