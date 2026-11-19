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

import type { ConversationDownloadFile } from '@/components/chat/conversation-download-context';
import { activateLivePlots } from '@/components/chat/plot/live-plots';
import { getPlotKey } from '@/components/chat/plot/rendered-plots';
import { getCodeTitle, PLOT_LANGUAGE } from '@/utils/code-blocks';
import {
  type AllowedDocumentImages,
  createAllowedImages,
  findAllowedImageUrl,
  loadDocumentImage,
} from '@/utils/files/document-images';
import { remarkNormalizeHtml, remarkRemoveUnapprovedImages } from '@/utils/files/document-markdown';
import { isImageFile } from '@/utils/files/generic';
import { parsePlotSpec } from '@/utils/plot/plot-spec';

import { renderPlotImage, waitForPlotActivation } from './plot-image';

const PARAGRAPH_SPACER = '\u200B';
const TABLE_CELL_PADDING = 80;
const CODE_BLOCK_HORIZONTAL_PADDING = 160;
const CODE_BLOCK_VERTICAL_PADDING = 120;
const CODE_BLOCK_BACKGROUND = '011627';
const CODE_BLOCK_HEADER_BACKGROUND = 'F1F5F9';
const CODE_BLOCK_HEADER_TEXT_COLOR = '000000';
const TABLE_BORDER = {
  color: 'B7B7B7',
  size: 4,
  style: BorderStyle.SINGLE,
};
const plotCodeNodes = new WeakSet<object>();
const plotExportMetadata = new WeakMap<object, { imageKey: string }>();

// encodeURIComponent leaves parentheses untouched, but an unescaped ')' can end a Markdown image destination early.
function encodeMarkdownImageDestination(value: string) {
  return encodeURIComponent(value).replaceAll('(', '%28').replaceAll(')', '%29');
}

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

// Barlow has no glyphs for arrows, check marks or ballot boxes, so those runs get a symbol font.
const SYMBOL_FONT = 'Segoe UI Symbol';
const SYMBOL_PATTERN = /([\u2190-\u21FF\u2600-\u27BF\u2B00-\u2BFF]+)/u;

type SymbolRunContext = {
  style: {
    bold?: boolean;
    italic?: boolean;
    strike?: boolean;
    inlineCode?: boolean;
    link?: boolean;
  };
  rtl?: boolean;
};

function createSymbolRuns(value: string, { style, rtl }: SymbolRunContext, inlineCode = false) {
  return value
    .split(SYMBOL_PATTERN)
    .filter((text) => text !== '')
    .map(
      (text) =>
        new TextRun({
          text,
          bold: style.bold,
          italics: style.italic,
          strike: style.strike,
          highlight: style.inlineCode || inlineCode ? 'lightGray' : undefined,
          style: style.link ? 'Hyperlink' : undefined,
          rightToLeft: rtl ? true : undefined,
          font: SYMBOL_PATTERN.test(text) ? SYMBOL_FONT : undefined,
        }),
    );
}

// remark-docx renders inline code through its own text builder, so it needs the same override.
export const symbolFontPlugin: RemarkDocxPlugin = async () => ({
  text: ({ value }, context) => createSymbolRuns(value, context),
  inlineCode: ({ value }, context) => createSymbolRuns(value, context, true),
});

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
      borders: {
        top: TABLE_BORDER,
        bottom: TABLE_BORDER,
        left: TABLE_BORDER,
        right: TABLE_BORDER,
        insideHorizontal: TABLE_BORDER,
        insideVertical: TABLE_BORDER,
      },
      margins: {
        top: TABLE_CELL_PADDING,
        bottom: TABLE_CELL_PADDING,
        left: TABLE_CELL_PADDING,
        right: TABLE_CELL_PADDING,
      },
    });
  },
});

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

      const plotImage = await renderPlotImage(parsed.spec);
      if (plotImage !== undefined) {
        images.set(imageKey, { type: 'png', ...plotImage });
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

function preparePlotCodeBlocks(root: Root, plotKeys: Set<string>) {
  visit(root, 'code', (node) => {
    if (node.lang !== PLOT_LANGUAGE) {
      return;
    }

    const parsed = parsePlotSpec(node.value);
    if (!('error' in parsed)) {
      plotKeys.add(getPlotKey(parsed.spec));
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
  id: string;
  role: string;
  content: string;
  images: Array<{ alt: string; url: string }>;
};

export type ConversationExport = {
  markdownBlocks: Array<{ markdown: string }>;
  allowedImages?: AllowedDocumentImages;
};

export function createConversationExportMessages({
  messages,
  fileMapping,
  imageUrl = (file) => `/api/files/${file.id}/scaled-image?width=200&height=320`,
}: {
  messages: Array<
    Pick<ConversationExportMessage, 'id' | 'role' | 'content'> & { createdAt?: Date }
  >;
  fileMapping: ReadonlyMap<string, ConversationDownloadFile[]>;
  imageUrl?: (file: ConversationDownloadFile) => string;
}): ConversationExportMessage[] {
  return messages.map(({ id, role, content }) => ({
    id,
    role,
    content,
    images: (fileMapping.get(id) ?? [])
      .filter((file) => isImageFile(file.name))
      .map((file) => ({
        alt: file.name,
        url: imageUrl(file),
      })),
  }));
}

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
    markdownBlocks.push(
      ...images.map(({ alt }) => ({
        markdown: `![${alt}](${encodeMarkdownImageDestination(alt)})`,
      })),
    );
  }

  markdownBlocks.push(
    { markdown: PARAGRAPH_SPACER },
    { markdown: PARAGRAPH_SPACER },
    { markdown: `#### Generiert von AIS.chat unter Nutzung von ${modelName}` },
  );

  const allowedImages = createAllowedImages(
    messages.flatMap(({ images }) => images.map(({ alt, url }) => ({ name: alt, url }))),
  );

  return { markdownBlocks, allowedImages };
}

function createDocxOptions({ allowedImages = new Map() }: MarkdownToDocxOptions = {}): DocxOptions {
  const loadImage = async (reference: string) => {
    const url = findAllowedImageUrl(reference, allowedImages);
    if (url === undefined) {
      throw new Error('Image is not an uploaded file');
    }
    return loadDocumentImage(url);
  };

  return {
    plugins: [
      latexPlugin(),
      imagePlugin({ load: loadImage }),
      plotPlugin,
      paddedCodeBlockPlugin,
      styledBlocksPlugin,
      symbolFontPlugin,
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
}

type MarkdownToDocxOptions = {
  // When set, only these uploaded images (by file name) are embedded; all other images are skipped.
  allowedImages?: AllowedDocumentImages;
  // Turns <br> into line breaks and drops other raw HTML instead of printing it as text.
  normalizeHtml?: boolean;
};

export async function markdownToDocxBlob(
  exportDocument: ConversationExport,
  options?: MarkdownToDocxOptions,
): Promise<Blob> {
  const allowedImages = options?.allowedImages ?? exportDocument.allowedImages ?? new Map();
  const docxOptions = { ...options, allowedImages };
  const processor = unified()
    .use(remarkParse)
    .use(RemarkMathPlugin)
    .use(remarkGfm)
    .use(remarkDocx, createDocxOptions(docxOptions));
  const roots = exportDocument.markdownBlocks.map(({ markdown }) => {
    const root = processor.parse(markdown) as Root;
    if (options?.normalizeHtml === true) {
      remarkNormalizeHtml()(root);
    }
    remarkRemoveUnapprovedImages(allowedImages)(root);
    return root;
  });
  const plotKeys = new Set<string>();
  roots.forEach((root) => preparePlotCodeBlocks(root, plotKeys));
  const restoreLivePlots = plotKeys.size > 0 ? activateLivePlots(plotKeys) : undefined;
  try {
    if (plotKeys.size > 0) {
      await waitForPlotActivation();
    }
    const processedRoots = await Promise.all(
      roots.map(async (root) => (await processor.run(root)) as Root),
    );
    const combinedRoot: Root = {
      type: 'root',
      children: processedRoots.flatMap((root) => root.children),
    };
    // Word needs a paragraph after a trailing table, otherwise it reports unreadable content.
    if (combinedRoot.children.at(-1)?.type === 'table') {
      combinedRoot.children.push({
        type: 'paragraph',
        children: [{ type: 'text', value: PARAGRAPH_SPACER }],
      });
    }
    const arrayBuffer = await processor.stringify(combinedRoot);

    return new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  } finally {
    restoreLivePlots?.();
  }
}
