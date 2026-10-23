import { AlignmentType, BorderStyle, Paragraph, Table, TableCell, TableRow, WidthType } from 'docx';
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

const MAX_IMAGE_WIDTH = 200;
const MAX_IMAGE_HEIGHT = 320;
const PARAGRAPH_SPACER = '\u200B';

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
                      children: context.render(cell.children, {
                        ...context,
                        rtl: undefined,
                      }),
                    }),
                  ],
                }),
            ),
          }),
      ),
      width: { size: 100, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      style: 'TableGrid',
    });
  },
});

export type ConversationExportMessage = {
  role: string;
  content: string;
  images: Array<{ alt: string; url: string }>;
};

export type ConversationExport = {
  markdownBlocks: string[];
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
  const markdownBlocks: string[] = [];

  if (conversationTitle !== undefined) {
    markdownBlocks.push(`# Konversation: ${conversationTitle}`);
  }
  markdownBlocks.push(`Erstellt am: ${formattedDate}`);

  for (const { role, content, images } of messages) {
    markdownBlocks.push(PARAGRAPH_SPACER);
    const messageHeading = role === 'user' ? 'Nutzer/in' : 'AIS.chat';
    markdownBlocks.push(`### ${messageHeading}:`, content);
    markdownBlocks.push(...images.map(({ alt, url }) => `![${alt}](${url})`));
  }

  markdownBlocks.push(
    PARAGRAPH_SPACER,
    PARAGRAPH_SPACER,
    `#### Generiert von AIS.chat unter Nutzung von ${modelName}`,
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
    shikiPlugin({ theme: 'dark-plus' }),
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
    exportDocument.markdownBlocks.map(async (markdownBlock) => {
      const parsedRoot = processor.parse(markdownBlock) as Root;
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
