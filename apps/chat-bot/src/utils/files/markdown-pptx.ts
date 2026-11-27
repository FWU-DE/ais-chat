import type {
  Definition,
  Heading,
  List,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
  Table,
} from 'mdast';
import PptxGenJS from 'pptxgenjs';
import remarkGfm from 'remark-gfm';
import RemarkMathPlugin from 'remark-math-extended';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { PLOT_LANGUAGE } from '@/utils/code-blocks';

import {
  arrayBufferToBase64,
  type DocumentImageReferences,
  loadDocumentImage,
} from './document-images';
import { getReferencedImageSources, renderDocumentPlots } from './document-markdown';
import { DEFAULT_PPTX_DESIGN, type PptxDesign } from './generated-document-format';
import {
  defineMasters,
  getMasterNames,
  PPTX_THEMES,
  type PptxTheme,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
} from './pptx-themes';

const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

// LAYOUT_WIDE is 13.33 x 7.5 inches. All measures below are inches.
const MARGIN_X = 0.6;
const BODY_WIDTH = SLIDE_WIDTH - 2 * MARGIN_X;
const TITLE_Y = 0.35;
const TITLE_HEIGHT = 0.9;
const BODY_Y = 1.5;
const BODY_HEIGHT = SLIDE_HEIGHT - BODY_Y - 0.6;
const MAX_IMAGE_HEIGHT = 4.5;
const MAX_IMAGE_PIXELS = 1000;

const BODY_FONT_SIZE = 20;
const CODE_FONT_SIZE = 14;
const TABLE_FONT_SIZE = 14;
const HEADING_FONT_SIZE = 22;
const LINE_HEIGHT = 1.2;
const AVERAGE_CHARACTER_WIDTH = 0.5;
const PARAGRAPH_GAP = 0.15;
const LIST_ITEM_GAP = 0.05;
const NESTED_INDENT = 0.4;
const BOX_PADDING = 0.1;

const CODE_FONT = 'Courier New';
const MATH_FONT = 'Cambria Math';

type TextRun = PptxGenJS.TextProps;

type RunStyle = {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
  color?: string;
};

type Paragraph = {
  runs: TextRun[];
  text: string;
  level: number;
  fontSize: number;
  bullet?: PptxGenJS.TextPropsOptions['bullet'];
};

type ImageSource = { data: string; width: number; height: number };

// A block laid out on a slide; `render` places it at the given distance from the slide's body top.
type Unit = {
  height: number;
  gapAfter: number;
  render: (slide: PptxGenJS.Slide, y: number) => void;
};

type SlideDraft = { title?: string; depth?: number; blocks: RootContent[] };

type BuildContext = {
  theme: PptxTheme;
  images: ReadonlyMap<string, ImageSource>;
  plots: ReadonlyMap<string, ImageSource>;
  definitions: ReadonlyMap<string, string>;
};

function toPlainText(node: object): string {
  const { value, children } = node as { value?: string; children?: object[] };
  if (typeof value === 'string') {
    return value;
  }
  return (children ?? []).map(toPlainText).join('');
}

function estimateLines(text: string, fontSize: number, width: number) {
  const charactersPerLine = Math.max(
    1,
    Math.floor((width * 72) / (fontSize * AVERAGE_CHARACTER_WIDTH)),
  );
  return text
    .split('\n')
    .reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
}

function estimateTextHeight(paragraphs: Paragraph[], width: number) {
  return (
    paragraphs.reduce(
      (height, { text, level, fontSize }) =>
        height +
        (estimateLines(text, fontSize, width - level * NESTED_INDENT - NESTED_INDENT) *
          fontSize *
          LINE_HEIGHT) /
          72,
      0,
    ) +
    2 * BOX_PADDING
  );
}

function fitImage({ width, height }: { width: number; height: number }) {
  const scale = Math.min(BODY_WIDTH / width, MAX_IMAGE_HEIGHT / height);
  return { width: width * scale, height: height * scale };
}

function createRun(text: string, style: RunStyle): TextRun {
  const options: PptxGenJS.TextPropsOptions = {};
  if (style.bold) options.bold = true;
  if (style.italic) options.italic = true;
  if (style.strike) options.strike = 'sngStrike';
  if (style.color !== undefined) options.color = style.color;
  if (style.code) options.fontFace = CODE_FONT;
  if (style.link !== undefined) {
    options.hyperlink = { url: style.link };
    options.underline = { style: 'sng' };
  }
  return { text, options };
}

type InlineResult = { runs: TextRun[]; images: string[] };

function collectInline(
  nodes: PhrasingContent[],
  style: RunStyle,
  context: BuildContext,
  result: InlineResult,
) {
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        result.runs.push(createRun(node.value, style));
        break;
      case 'strong':
        collectInline(node.children, { ...style, bold: true }, context, result);
        break;
      case 'emphasis':
        collectInline(node.children, { ...style, italic: true }, context, result);
        break;
      case 'delete':
        collectInline(node.children, { ...style, strike: true }, context, result);
        break;
      case 'link':
        collectInline(
          node.children,
          { ...style, link: node.url, color: context.theme.link },
          context,
          result,
        );
        break;
      case 'inlineCode':
        result.runs.push(createRun(node.value, { ...style, code: true }));
        break;
      case 'break':
        result.runs.push(createRun('\n', style));
        break;
      case 'image':
        result.images.push(node.url);
        break;
      case 'imageReference': {
        const url = context.definitions.get(node.identifier);
        if (url !== undefined) result.images.push(url);
        break;
      }
      case 'footnoteReference':
        result.runs.push(createRun(`[${node.identifier}]`, style));
        break;
      case 'html':
        break;
      default:
        if ((node as { type: string }).type === 'inlineMath') {
          result.runs.push({
            text: (node as unknown as { value: string }).value,
            options: { ...createRun('', style).options, italic: true, fontFace: MATH_FONT },
          });
        } else if ('children' in node) {
          collectInline(node.children as PhrasingContent[], style, context, result);
        }
    }
  }
}

function createParagraph(
  inline: InlineResult,
  fontSize: number,
  level = 0,
  bullet?: Paragraph['bullet'],
): Paragraph {
  return {
    runs: inline.runs,
    text: inline.runs.map(({ text }) => String(text)).join(''),
    level,
    fontSize,
    bullet,
  };
}

function createTextUnit(
  paragraphs: Paragraph[],
  { theme }: BuildContext,
  {
    gapAfter = PARAGRAPH_GAP,
    fill,
    fontFace = theme.fontFace,
  }: { gapAfter?: number; fill?: string; fontFace?: string } = {},
): Unit {
  const height = estimateTextHeight(paragraphs, BODY_WIDTH);
  const runs: TextRun[] = paragraphs.flatMap((paragraph, paragraphIndex) =>
    paragraph.runs.map((run, runIndex) => {
      const isFirst = runIndex === 0;
      const isLast = runIndex === paragraph.runs.length - 1;
      return {
        text: run.text,
        options: {
          ...run.options,
          fontSize: paragraph.fontSize,
          ...(isFirst && paragraph.bullet !== undefined
            ? { bullet: paragraph.bullet, indentLevel: paragraph.level }
            : {}),
          ...(isLast && paragraphIndex < paragraphs.length - 1 ? { breakLine: true } : {}),
        },
      };
    }),
  );
  return {
    height,
    gapAfter,
    render: (slide, y) => {
      slide.addText(runs, {
        x: MARGIN_X,
        y: BODY_Y + y,
        w: BODY_WIDTH,
        h: height,
        margin: BOX_PADDING * 72,
        valign: 'top',
        fit: 'shrink',
        color: theme.text,
        fontFace,
        ...(fill === undefined ? {} : { fill: { color: fill } }),
      });
    },
  };
}

function createImageUnit(image: ImageSource): Unit {
  const { width, height } = fitImage(image);
  return {
    height,
    gapAfter: PARAGRAPH_GAP,
    render: (slide, y) => {
      slide.addImage({
        data: image.data,
        x: MARGIN_X + (BODY_WIDTH - width) / 2,
        y: BODY_Y + y,
        w: width,
        h: height,
      });
    },
  };
}

function createListParagraphs(
  list: List,
  level: number,
  context: BuildContext,
  images: string[],
  firstIndex = 0,
  count = list.children.length,
) {
  const start = list.start ?? 1;
  return list.children.slice(firstIndex, firstIndex + count).flatMap((item, offset) => {
    const bullet: Paragraph['bullet'] = list.ordered
      ? {
          type: 'number',
          ...(start + firstIndex + offset === 1
            ? {}
            : { numberStartAt: start + firstIndex + offset }),
        }
      : true;
    return createListItemParagraphs(item, bullet, level, context, images);
  });
}

function createListItemParagraphs(
  item: ListItem,
  bullet: Paragraph['bullet'],
  level: number,
  context: BuildContext,
  images: string[],
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let isFirstText = true;
  for (const child of item.children) {
    if (child.type === 'list') {
      paragraphs.push(...createListParagraphs(child, level + 1, context, images));
      continue;
    }
    const inline: InlineResult = { runs: [], images };
    if (child.type === 'paragraph') {
      collectInline(child.children, {}, context, inline);
    } else {
      inline.runs.push(createRun(toPlainText(child), {}));
    }
    if (inline.runs.length === 0) {
      continue;
    }
    paragraphs.push(
      createParagraph(inline, BODY_FONT_SIZE, level, isFirstText ? bullet : undefined),
    );
    isFirstText = false;
  }
  return paragraphs;
}

function createListUnits(list: List, context: BuildContext, quoteStyle: boolean): Unit[] {
  const units: Unit[] = [];
  list.children.forEach((_, index) => {
    const images: string[] = [];
    const paragraphs = createListParagraphs(list, 0, context, images, index, 1);
    if (quoteStyle) {
      paragraphs.forEach((paragraph) => {
        paragraph.runs = paragraph.runs.map((run) => ({
          ...run,
          options: { ...run.options, italic: true, color: context.theme.muted },
        }));
      });
    }
    const isLast = index === list.children.length - 1;
    if (paragraphs.length > 0) {
      units.push(
        createTextUnit(paragraphs, context, { gapAfter: isLast ? PARAGRAPH_GAP : LIST_ITEM_GAP }),
      );
    }
    units.push(...createImageUnits(images, context));
  });
  return units;
}

function createImageUnits(sources: string[], context: BuildContext): Unit[] {
  return sources.flatMap((source) => {
    const image = context.images.get(source);
    return image === undefined ? [] : [createImageUnit(image)];
  });
}

function createTableUnits(table: Table, theme: PptxTheme): Unit[] {
  const columnCount = Math.max(1, ...table.children.map((row) => row.children.length));
  const columnWidth = BODY_WIDTH / columnCount;
  const rows = table.children.map((row, rowIndex) => {
    const cells = row.children.map((cell, columnIndex) => {
      const text = toPlainText(cell);
      const align = table.align?.[columnIndex] ?? undefined;
      return {
        text,
        options: {
          color: rowIndex === 0 ? theme.tableHeaderText : theme.text,
          ...(rowIndex === 0 ? { bold: true, fill: { color: theme.tableHeaderFill } } : {}),
          ...(align ? { align } : {}),
        },
      };
    });
    const lines = Math.max(
      1,
      ...cells.map(({ text }) => estimateLines(text, TABLE_FONT_SIZE, columnWidth - 0.2)),
    );
    return { cells, height: (lines * TABLE_FONT_SIZE * LINE_HEIGHT) / 72 + 0.2 };
  });

  const [header, ...body] = rows;
  if (header === undefined) {
    return [];
  }
  // Long tables continue on following slides with a repeated header row.
  const chunks: (typeof rows)[] = [];
  let chunk = [header];
  let chunkHeight = header.height;
  for (const row of body) {
    if (chunk.length > 1 && chunkHeight + row.height > BODY_HEIGHT) {
      chunks.push(chunk);
      chunk = [header];
      chunkHeight = header.height;
    }
    chunk.push(row);
    chunkHeight += row.height;
  }
  chunks.push(chunk);

  return chunks.map((chunkRows) => ({
    height: chunkRows.reduce((sum, row) => sum + row.height, 0),
    gapAfter: PARAGRAPH_GAP,
    render: (slide, y) => {
      slide.addTable(
        chunkRows.map((row) => row.cells),
        {
          x: MARGIN_X,
          y: BODY_Y + y,
          w: BODY_WIDTH,
          colW: Array<number>(columnCount).fill(columnWidth),
          fontSize: TABLE_FONT_SIZE,
          fontFace: theme.fontFace,
          border: { type: 'solid', color: theme.border, pt: 1 },
          margin: 0.06,
          valign: 'middle',
        },
      );
    },
  }));
}

function createBlockUnits(block: RootContent, context: BuildContext, quoteStyle = false): Unit[] {
  const style: RunStyle = quoteStyle ? { italic: true, color: context.theme.muted } : {};
  switch (block.type) {
    case 'paragraph': {
      const inline: InlineResult = { runs: [], images: [] };
      collectInline(block.children, style, context, inline);
      return [
        ...(inline.runs.some(({ text }) => String(text).trim() !== '')
          ? [createTextUnit([createParagraph(inline, BODY_FONT_SIZE)], context)]
          : []),
        ...createImageUnits(inline.images, context),
      ];
    }
    case 'heading': {
      const inline: InlineResult = { runs: [], images: [] };
      collectInline(
        block.children,
        { ...style, bold: true, color: context.theme.heading },
        context,
        inline,
      );
      return [
        createTextUnit([createParagraph(inline, HEADING_FONT_SIZE)], context, {
          fontFace: context.theme.fontFace,
        }),
      ];
    }
    case 'list':
      return createListUnits(block, context, quoteStyle);
    case 'table':
      return createTableUnits(block, context.theme);
    case 'blockquote':
      return block.children.flatMap((child) => createBlockUnits(child, context, true));
    case 'code': {
      const plot = block.lang === PLOT_LANGUAGE ? context.plots.get(block.value) : undefined;
      if (plot !== undefined) {
        return [createImageUnit(plot)];
      }
      const paragraphs = block.value
        .split('\n')
        .map((line) =>
          createParagraph({ runs: [createRun(line, { code: true })], images: [] }, CODE_FONT_SIZE),
        );
      return [
        createTextUnit(paragraphs, context, {
          fill: context.theme.codeBackground,
          fontFace: CODE_FONT,
        }),
      ];
    }
    case 'math': {
      const inline: InlineResult = {
        runs: [createRun(block.value, { italic: true })],
        images: [],
      };
      return [
        createTextUnit([createParagraph(inline, BODY_FONT_SIZE)], context, { fontFace: MATH_FONT }),
      ];
    }
    case 'html':
    case 'definition':
    case 'footnoteDefinition':
    case 'yaml':
    case 'thematicBreak':
      return [];
    default:
      return [];
  }
}

// `#` and `##` headings and `---` start a new slide; everything else belongs to the current slide.
function splitIntoSlides(root: Root): SlideDraft[] {
  const slides: SlideDraft[] = [];
  let current: SlideDraft = { blocks: [] };
  const flush = () => {
    if (current.title !== undefined || current.blocks.length > 0) {
      slides.push(current);
    }
  };
  for (const block of root.children) {
    if (block.type === 'heading' && (block as Heading).depth <= 2) {
      flush();
      current = { title: toPlainText(block), depth: (block as Heading).depth, blocks: [] };
    } else if (block.type === 'thematicBreak') {
      flush();
      current = { blocks: [] };
    } else {
      current.blocks.push(block);
    }
  }
  flush();
  return slides;
}

const COVER_IMAGE_TEXT_COLOR = 'FFFFFF';
const COVER_IMAGE_OVERLAY_TRANSPARENCY = 45;

function addTitle(
  slide: PptxGenJS.Slide,
  title: string,
  isTitleSlide: boolean,
  theme: PptxTheme,
  titleColor = isTitleSlide ? theme.titleSlide.title : theme.heading,
) {
  slide.addText(title, {
    x: MARGIN_X,
    y: isTitleSlide ? 1.6 : TITLE_Y,
    w: BODY_WIDTH,
    h: isTitleSlide ? 2.8 : TITLE_HEIGHT,
    fontSize: isTitleSlide ? 44 : title.length > 60 ? 24 : 32,
    fontFace: theme.fontFace,
    color: titleColor,
    bold: true,
    align: isTitleSlide ? 'center' : 'left',
    valign: isTitleSlide ? 'bottom' : 'top',
    fit: 'shrink',
  });
}

function addSubtitle(
  slide: PptxGenJS.Slide,
  subtitle: string,
  theme: PptxTheme,
  color = theme.titleSlide.subtitle,
) {
  slide.addText(subtitle, {
    x: MARGIN_X,
    y: 4.9,
    w: BODY_WIDTH,
    h: 1.2,
    fontSize: 24,
    fontFace: theme.fontFace,
    color,
    align: 'center',
    valign: 'top',
    fit: 'shrink',
  });
}

type Cover = { subtitle: string; image?: ImageSource };

// The opening `#` heading with at most one text paragraph and optional images becomes the title slide; a heading alone is a section slide.
function getCover(
  draft: SlideDraft,
  isFirst: boolean,
  hasUnits: boolean,
  context: BuildContext,
): Cover | undefined {
  if (draft.title === undefined) {
    return undefined;
  }
  if (!hasUnits) {
    return { subtitle: '' };
  }
  if (!isFirst || draft.depth !== 1) {
    return undefined;
  }

  const texts: string[] = [];
  let image: ImageSource | undefined;
  for (const block of draft.blocks) {
    if (block.type !== 'paragraph') {
      return undefined;
    }
    const inline: InlineResult = { runs: [], images: [] };
    collectInline(block.children, {}, context, inline);
    const text = inline.runs
      .map((run) => String(run.text))
      .join('')
      .trim();
    if (text !== '') {
      texts.push(text);
    }
    image ??= inline.images.map((source) => context.images.get(source)).find(Boolean);
  }
  return texts.length <= 1 ? { subtitle: texts[0] ?? '', image } : undefined;
}

// Fills the whole slide with the image and darkens it so the title stays readable.
function addCoverBackground(pptx: PptxGenJS, slide: PptxGenJS.Slide, image: ImageSource) {
  // w/h only carry the image's aspect ratio for `cover`; the box is the slide.
  slide.addImage({
    data: image.data,
    x: 0,
    y: 0,
    w: 10,
    h: (10 * image.height) / image.width,
    sizing: { type: 'cover', w: SLIDE_WIDTH, h: SLIDE_HEIGHT },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_WIDTH,
    h: SLIDE_HEIGHT,
    fill: { color: '000000', transparency: COVER_IMAGE_OVERLAY_TRANSPARENCY },
    line: { color: '000000', transparency: 100 },
  });
}

function addSlides(
  pptx: PptxGenJS,
  drafts: SlideDraft[],
  context: BuildContext,
  design: PptxDesign,
) {
  const masters = getMasterNames(design);
  for (const [draftIndex, draft] of drafts.entries()) {
    const units = draft.blocks.flatMap((block) => createBlockUnits(block, context));
    if (units.length === 0 && draft.title === undefined) {
      continue;
    }
    const cover = getCover(draft, draftIndex === 0, units.length > 0, context);
    if (draft.title !== undefined && cover !== undefined) {
      const slide = pptx.addSlide({ masterName: masters.title });
      const textColor = cover.image === undefined ? undefined : COVER_IMAGE_TEXT_COLOR;
      if (cover.image !== undefined) addCoverBackground(pptx, slide, cover.image);
      addTitle(slide, draft.title, true, context.theme, textColor);
      if (cover.subtitle !== '') addSubtitle(slide, cover.subtitle, context.theme, textColor);
      continue;
    }

    // Content that does not fit moves to a continuation slide with the same title.
    const pages: { unit: Unit; y: number }[][] = [[]];
    let y = 0;
    for (const unit of units) {
      const page = pages[pages.length - 1] as { unit: Unit; y: number }[];
      if (page.length > 0 && y + unit.height > BODY_HEIGHT) {
        pages.push([{ unit, y: 0 }]);
        y = unit.height + unit.gapAfter;
      } else {
        page.push({ unit, y });
        y += unit.height + unit.gapAfter;
      }
    }

    for (const page of pages) {
      const slide = pptx.addSlide({ masterName: masters.content });
      if (draft.title !== undefined) {
        addTitle(slide, draft.title, false, context.theme);
      }
      page.forEach(({ unit, y: unitY }) => unit.render(slide, unitY));
    }
  }
}

async function loadImages(
  root: Root,
  imageReferences: DocumentImageReferences,
): Promise<Map<string, ImageSource>> {
  const referencedSources = getReferencedImageSources(root);
  const entries = await Promise.all(
    [...imageReferences.entries()]
      .filter(([source]) => referencedSources.has(source))
      .map(async ([source, url]) => {
        const image = await loadDocumentImage(url, MAX_IMAGE_PIXELS);
        return [
          source,
          {
            data: `${image.mimeType};base64,${arrayBufferToBase64(image.data)}`,
            width: image.width,
            height: image.height,
          },
        ] as const;
      }),
  );
  return new Map(entries);
}

// Builds an editable presentation: one slide per `#`/`##` heading or `---`, with content laid out top to bottom.
export async function markdownToPptxBlob(
  markdown: string,
  imageReferences: DocumentImageReferences = new Map(),
  title = 'Dokument',
  design: PptxDesign = DEFAULT_PPTX_DESIGN,
): Promise<Blob> {
  const root = unified()
    .use(remarkParse)
    .use(RemarkMathPlugin)
    .use(remarkGfm)
    .parse(markdown) as Root;
  const [images, plotImages] = await Promise.all([
    loadImages(root, imageReferences),
    renderDocumentPlots(root),
  ]);
  const plots = new Map(
    [...plotImages].map(([code, image]) => [
      code,
      {
        data: `image/png;base64,${arrayBufferToBase64(image.data)}`,
        width: image.width,
        height: image.height,
      },
    ]),
  );
  const definitions = new Map<string, string>();
  visit(root, 'definition', (node: Definition) => {
    definitions.set(node.identifier, node.url);
  });

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title;
  defineMasters(pptx, design);
  addSlides(
    pptx,
    splitIntoSlides(root),
    { theme: PPTX_THEMES[design], images, plots, definitions },
    design,
  );

  const data = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  return new Blob([data], { type: PPTX_MIME_TYPE });
}
