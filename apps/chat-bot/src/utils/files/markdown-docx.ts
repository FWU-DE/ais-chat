import { createBoard } from '@/components/chat/plot/jsxgraph-board';
import { renderPlotPng } from '@/components/chat/plot/png-export';
import { getRenderedPlot } from '@/components/chat/plot/rendered-plots';
import { getCodeTitle, PLOT_LANGUAGE } from '@/utils/code-blocks';
import { parsePlotSpec, type BoundingBox } from '@/utils/plot/plot-spec';
import type { ParagraphChild } from 'docx';
import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ShadingType,
  Table,
  TableBorders,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import JXG from 'jsxgraph';
import type { Root } from 'mdast';
import type { DocxOptions, RemarkDocxPlugin } from 'remark-docx';
import remarkDocx from 'remark-docx';
import { imagePlugin } from 'remark-docx/plugins/image';
import { latexPlugin } from 'remark-docx/plugins/latex';
import { shikiPlugin } from 'remark-docx/plugins/shiki';
import remarkGfm from 'remark-gfm';
import RemarkMathPlugin from 'remark-math-extended';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

const MAX_IMAGE_WIDTH = 200;
const MAX_IMAGE_HEIGHT = 320;
const PARAGRAPH_SPACER = '\u200B';
const PLOT_IMAGE_WIDTH = 600;
const PLOT_IMAGE_MIN_HEIGHT = 260;
const PLOT_IMAGE_MAX_HEIGHT = 450;
const DEFAULT_PLOT_BOUNDING_BOX: BoundingBox = [-5, 5, 5, -5];
const TABLE_CELL_PADDING = 80;
const CODE_BLOCK_HORIZONTAL_PADDING = 160;
const CODE_BLOCK_VERTICAL_PADDING = 120;
const CODE_BLOCK_BACKGROUND = '011627';
const CODE_BLOCK_HEADER_BACKGROUND = 'F1F5F9';
const CODE_BLOCK_HEADER_TEXT_COLOR = '000000';
const plotCodeNodes = new WeakSet<object>();
const plotExportMetadata = new WeakMap<object, { imageKey: string }>();

const paddedCodeBlockPlugin: RemarkDocxPlugin = (() => {
  const highlightCodeBlocks = shikiPlugin({ theme: 'night-owl' });

  return async (pluginContext) => {
    const { code } = await highlightCodeBlocks(pluginContext);

    return {
      code: (node, context) => {
        const highlightedCode = code?.(node, context);
        const paragraphs = (
          Array.isArray(highlightedCode) ? highlightedCode : [highlightedCode]
        ).filter((child): child is Paragraph => child instanceof Paragraph);

        if (paragraphs.length === 0) {
          return null;
        }

        return new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: [node.lang, getCodeTitle(node.meta)].filter(Boolean).join(' – '),
                          color: CODE_BLOCK_HEADER_TEXT_COLOR,
                          size: 22,
                        }),
                      ],
                    }),
                  ],
                  margins: {
                    top: TABLE_CELL_PADDING,
                    bottom: TABLE_CELL_PADDING,
                    left: CODE_BLOCK_HORIZONTAL_PADDING,
                    right: CODE_BLOCK_HORIZONTAL_PADDING,
                  },
                  shading: {
                    type: ShadingType.CLEAR,
                    color: 'auto',
                    fill: CODE_BLOCK_HEADER_BACKGROUND,
                  },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: paragraphs,
                  margins: {
                    top: CODE_BLOCK_VERTICAL_PADDING,
                    bottom: CODE_BLOCK_VERTICAL_PADDING,
                    left: CODE_BLOCK_HORIZONTAL_PADDING,
                    right: CODE_BLOCK_HORIZONTAL_PADDING,
                  },
                  shading: {
                    type: ShadingType.CLEAR,
                    color: 'auto',
                    fill: CODE_BLOCK_BACKGROUND,
                  },
                }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: TableBorders.NONE,
        });
      },
    };
  };
})();

const styledBlocksPlugin: RemarkDocxPlugin = async () => ({
  thematicBreak: () =>
    new Paragraph({
      border: {
        bottom: {
          color: 'D9E1E8',
          size: 4,
          space: 1,
          style: BorderStyle.SINGLE,
        },
      },
      spacing: { before: 120, after: 120 },
    }),
  table: ({ children, align }, context) => {
    const columnCount = children[0]?.children.length ?? 1;
    const columnWidth = context.width / columnCount;
    const textAlign = align?.map((alignment) => {
      if (alignment === 'center') return AlignmentType.CENTER;
      if (alignment === 'right') return AlignmentType.RIGHT;
      return AlignmentType.LEFT;
    });

    return new Table({
      columnWidths: Array.from({ length: columnCount }, () => columnWidth),
      rows: children.map(
        (row) =>
          new TableRow({
            children: row.children.map(
              (cell, index) =>
                new TableCell({
                  width: { size: columnWidth, type: WidthType.DXA },
                  children: [
                    new Paragraph({
                      alignment: textAlign?.[index] ?? AlignmentType.LEFT,
                      children: context
                        .render(cell.children, {
                          ...context,
                          rtl: undefined,
                        })
                        .filter(
                          (child): child is ParagraphChild =>
                            !(
                              child instanceof Paragraph ||
                              child instanceof Table ||
                              child instanceof TableOfContents
                            ),
                        ),
                    }),
                  ],
                }),
            ),
          }),
      ),
      width: { size: 100, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      style: 'TableGrid',
      margins: {
        top: TABLE_CELL_PADDING,
        bottom: TABLE_CELL_PADDING,
        left: TABLE_CELL_PADDING,
        right: TABLE_CELL_PADDING,
      },
    });
  },
});

function getPlotImageDimensions(boundingBox: BoundingBox) {
  const [xMin, yMax, xMax, yMin] = boundingBox;
  const aspectRatio = (xMax - xMin) / (yMax - yMin);
  return {
    width: PLOT_IMAGE_WIDTH,
    height: Math.round(
      Math.min(
        PLOT_IMAGE_MAX_HEIGHT,
        Math.max(PLOT_IMAGE_MIN_HEIGHT, PLOT_IMAGE_WIDTH / aspectRatio),
      ),
    ),
  };
}

const plotPlugin: RemarkDocxPlugin = async ({ root, images }) => {
  const plotCodeBlocks: Array<{ value: string; imageKey: string }> = [];
  visit(root, 'code', (node) => {
    if (plotCodeNodes.has(node)) {
      const metadata = plotExportMetadata.get(node);
      plotCodeBlocks.push({
        value: node.value,
        imageKey: metadata?.imageKey ?? `plot:${node.value}`,
      });
    }
  });

  await Promise.all(
    plotCodeBlocks.map(async ({ value, imageKey }) => {
      if (images.has(imageKey)) {
        return;
      }

      const parsed = parsePlotSpec(value);
      if ('error' in parsed) {
        return;
      }

      const renderedPlot = getRenderedPlot(parsed.spec);
      if (renderedPlot !== undefined) {
        const { width: renderedWidth, height: renderedHeight } =
          renderedPlot.getBoundingClientRect();
        const scale = Math.min(
          PLOT_IMAGE_WIDTH / renderedWidth,
          PLOT_IMAGE_MAX_HEIGHT / renderedHeight,
        );
        const width = Math.round(renderedWidth * scale);
        const height = Math.round(renderedHeight * scale);
        const png = await renderPlotPng(renderedPlot);
        images.set(imageKey, {
          type: 'png',
          width,
          height,
          data: await png.arrayBuffer(),
        });
        return;
      }

      const { width, height } = getPlotImageDimensions(
        parsed.spec.board.boundingBox ?? DEFAULT_PLOT_BOUNDING_BOX,
      );
      const container = document.createElement('div');
      container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
      document.body.append(container);

      let board: JXG.Board | undefined;
      try {
        board = createBoard(container, parsed.spec, undefined, [], false).board;
        // sync jsx graph rendering with the browser's rendering cycle
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        board.fullUpdate();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const svg = container.querySelector('svg');
        if (svg === null) {
          return;
        }

        const png = await renderPlotPng(svg);
        images.set(imageKey, {
          type: 'png',
          width,
          height,
          data: await png.arrayBuffer(),
        });
      } finally {
        if (board !== undefined) {
          JXG.JSXGraph.freeBoard(board);
        }
        container.remove();
      }
    }),
  );

  return {
    code: (node, context) => {
      const imageKey = plotExportMetadata.get(node)?.imageKey;
      return !plotCodeNodes.has(node) || imageKey === undefined || !context.images.has(imageKey)
        ? null
        : new Paragraph({
            children: context
              .render([{ type: 'image', url: imageKey }])
              .filter(
                (child): child is ParagraphChild =>
                  !(
                    child instanceof Paragraph ||
                    child instanceof Table ||
                    child instanceof TableOfContents
                  ),
              ),
          });
    },
  };
};

function preparePlotCodeBlocks(root: Root) {
  visit(root, 'code', (node) => {
    if (node.lang !== PLOT_LANGUAGE) {
      return;
    }

    // Set lang here to json so shikiPlugin renders the code blocks correctly
    // as it only recognizes json but not jsxgraph-json
    node.lang = 'json';
    plotCodeNodes.add(node);
    plotExportMetadata.set(node, {
      imageKey: `plot:${node.value}`,
    });
  });
}

export type ConversationExportMessage = {
  role: string;
  content: string;
  images: Array<{ alt: string; url: string }>;
};

export type ConversationExport = {
  markdownBlocks: Array<{ markdown: string }>;
};

export function formatConversationExport({
  messages,
  createdAt,
  modelName,
  conversationTitle,
}: {
  messages: ConversationExportMessage[];
  createdAt: string;
  modelName: string;
  conversationTitle?: string;
}): ConversationExport {
  const formattedDate = new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(new Date(createdAt));
  const markdownBlocks: ConversationExport['markdownBlocks'] = [];

  if (conversationTitle !== undefined) {
    markdownBlocks.push({ markdown: `# Konversation: ${conversationTitle}` });
  }
  markdownBlocks.push({ markdown: `Erstellt am: ${formattedDate}` });

  for (const { role, content, images } of messages) {
    markdownBlocks.push({ markdown: PARAGRAPH_SPACER });
    const messageHeading = role === 'user' ? 'Nutzer/in' : 'AIS.chat';
    markdownBlocks.push({ markdown: `### ${messageHeading}:` }, { markdown: content });
    markdownBlocks.push(...images.map(({ alt, url }) => ({ markdown: `![${alt}](${url})` })));
  }

  markdownBlocks.push(
    { markdown: PARAGRAPH_SPACER },
    { markdown: PARAGRAPH_SPACER },
    { markdown: `#### Generiert von AIS.chat unter Nutzung von ${modelName}` },
  );

  return { markdownBlocks };
}

async function loadImageForDocx(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load image: ${response.status}`);
  }

  const imageBlob = await response.blob();
  if (imageBlob.type === 'image/svg+xml') {
    return imageBlob.arrayBuffer();
  }

  const bitmap = await createImageBitmap(imageBlob);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width, MAX_IMAGE_HEIGHT / bitmap.height);

  if (scale === 1) {
    return imageBlob.arrayBuffer();
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const resizedBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('Failed to resize image')) : resolve(blob)),
      'image/png',
    );
  });

  return resizedBlob.arrayBuffer();
}

const docxOptions: DocxOptions = {
  plugins: [
    latexPlugin(),
    imagePlugin({ load: loadImageForDocx }),
    plotPlugin,
    paddedCodeBlockPlugin,
    styledBlocksPlugin,
  ],
  spacing: 80,
  thematicBreak: 'line',
  orderedListFormat: [
    { format: 'DECIMAL', text: '%1.' },
    { format: 'DECIMAL', text: '%2.' },
    { format: 'DECIMAL', text: '%3.' },
    { format: 'DECIMAL', text: '%4.' },
  ],
  styles: {
    default: {
      document: {
        run: { font: 'Barlow', size: 22 },
      },
      title: { run: { font: 'Barlow SemiBold', size: 40 } },
      heading1: { run: { font: 'Barlow SemiBold', size: 28 } },
      heading2: {
        run: { font: 'Barlow SemiBold', size: 22 },
      },
      heading3: {
        run: { font: 'Barlow', size: 18, bold: false, italics: true, color: '666666' },
      },
      listParagraph: { run: { font: 'Barlow', size: 22 } },
    },
    characterStyles: [
      {
        id: 'Hyperlink',
        name: 'Hyperlink',
        run: { color: '2F80ED', size: 22 },
      },
    ],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(RemarkMathPlugin)
  .use(remarkGfm)
  .use(remarkDocx, docxOptions);

export async function markdownToDocxBlob(exportDocument: ConversationExport): Promise<Blob> {
  const roots = await Promise.all(
    exportDocument.markdownBlocks.map(async ({ markdown }) => {
      const parsedRoot = processor.parse(markdown) as Root;
      preparePlotCodeBlocks(parsedRoot);
      return (await processor.run(parsedRoot)) as Root;
    }),
  );
  const combinedRoot: Root = {
    type: 'root',
    children: roots.flatMap((root) => root.children),
  };
  const arrayBuffer = await processor.stringify(combinedRoot);

  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
