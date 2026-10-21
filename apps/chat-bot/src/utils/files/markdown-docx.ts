import type { DocxOptions } from 'remark-docx';
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

export type ConversationExportMessage = {
  role: string;
  content: string;
  images: Array<{ alt: string; url: string }>;
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
}): string {
  const formattedDate = new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(createdAt));
  const heading = conversationTitle === undefined ? '' : `# Konversation: ${conversationTitle}\n\n`;
  const messageContent = messages
    .map(({ role, content, images }) => {
      const messageHeading = role === 'user' ? 'Nutzer/in' : 'AIS.chat';
      const imageMarkdown = images.map(({ alt, url }) => `![${alt}](${url})`).join('\n');

      return `### ${messageHeading}:\n\n${content}\n\n${imageMarkdown}`;
    })
    .join(`\n\n${PARAGRAPH_SPACER}\n\n`);

  return `${heading}Erstellt am: ${formattedDate}\n\n${PARAGRAPH_SPACER}\n\n${messageContent}\n\n${PARAGRAPH_SPACER}\n\n${PARAGRAPH_SPACER}\n\n${PARAGRAPH_SPACER}\n\n#### Generiert von AIS.chat unter Nutzung von ${modelName}`;
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
  ],
  spacing: 80,
  // This prevents page breaks from occurring at thematic breaks, but also renders a black line.
  // The line styling can not be adapted for now in docx version (which we need for math support)
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
      title: { run: { font: 'Barlow', size: 40, bold: true } },
      heading1: { run: { font: 'Barlow', size: 28, bold: true } },
      heading2: {
        run: { font: 'Barlow', size: 22, bold: true },
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

export async function markdownToDocxBlob(markdown: string): Promise<Blob> {
  const file = await processor.process(markdown);
  const arrayBuffer = await file.result;

  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
