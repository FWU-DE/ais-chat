import type { PhrasingContent, Root, RootContent } from 'mdast';
import type { Content, ContentImage, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import {
  type AllowedDocumentImages,
  findAllowedImageUrl,
  loadDocumentImage,
} from './document-images';

type InlineStyle = Pick<ContentText, 'bold' | 'italics' | 'decoration' | 'link' | 'color'>;

const HEADING_SIZES = [22, 18, 15, 13, 12, 11];
const CODE_BACKGROUND = '#f2f2f2';

function bytesToBase64(data: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function loadImages(markdownRoot: Root, allowedImages: AllowedDocumentImages) {
  const references = new Set<string>();
  const collect = (node: RootContent | Root) => {
    if (node.type === 'image') {
      references.add(node.url);
    }
    if ('children' in node) {
      (node.children as RootContent[]).forEach(collect);
    }
  };
  collect(markdownRoot);

  const images = new Map<string, string>();
  await Promise.all(
    [...references].map(async (reference) => {
      const url = findAllowedImageUrl(reference, allowedImages);
      if (url === undefined) {
        return;
      }
      try {
        const { data, mimeType } = await loadDocumentImage(url);
        images.set(reference, `data:${mimeType};base64,${bytesToBase64(data)}`);
      } catch {
        // Images that fail to load are skipped.
      }
    }),
  );
  return images;
}

const SYMBOL_FONT = 'Symbols';
const SYMBOL_FONT_FILE = 'NotoSansSymbols2-subset.ttf';
const SYMBOL_FONT_URL = `/fonts/noto-sans-symbols-2/${SYMBOL_FONT_FILE}`;
// Dingbats, miscellaneous symbols and arrows are missing in Roboto.
const SYMBOL_PATTERN = /([\u2600-\u27BF\u2B00-\u2BFF]+)/u;

function textRuns(value: string, style: InlineStyle): Content[] {
  return value
    .split(SYMBOL_PATTERN)
    .map((text, index) => ({ text, ...style, ...(index % 2 === 1 && { font: SYMBOL_FONT }) }))
    .filter(({ text }) => text !== '');
}

async function loadSymbolFont() {
  const response = await fetch(SYMBOL_FONT_URL);
  if (!response.ok) {
    throw new Error(`Failed to load symbol font: ${response.status}`);
  }
  return bytesToBase64(await response.arrayBuffer());
}

function inline(
  nodes: PhrasingContent[],
  images: Map<string, string>,
  style: InlineStyle = {},
): Content[] {
  return nodes.flatMap((node): Content[] => {
    switch (node.type) {
      case 'text':
        return textRuns(node.value, style);
      case 'strong':
        return inline(node.children, images, { ...style, bold: true });
      case 'emphasis':
        return inline(node.children, images, { ...style, italics: true });
      case 'delete':
        return inline(node.children, images, { ...style, decoration: 'lineThrough' });
      case 'inlineCode':
        return [{ text: node.value, ...style, background: CODE_BACKGROUND }];
      case 'link':
        return inline(node.children, images, {
          ...style,
          link: node.url,
          color: '#2F80ED',
          decoration: 'underline',
        });
      case 'break':
        return [{ text: '\n' }];
      case 'image': {
        const image = images.get(node.url);
        return image === undefined ? [] : [{ image, fit: [240, 240] }];
      }
      default:
        return 'value' in node ? [{ text: String(node.value), ...style }] : [];
    }
  });
}

function block(node: RootContent, images: Map<string, string>): Content[] {
  switch (node.type) {
    case 'heading':
      return [
        {
          text: inline(node.children, images),
          fontSize: HEADING_SIZES[node.depth - 1],
          bold: true,
          margin: [0, 10, 0, 4],
        },
      ];
    case 'paragraph': {
      const parts = inline(node.children, images);
      const imageParts = parts.filter(
        (part): part is ContentImage => typeof part === 'object' && 'image' in part,
      );
      return imageParts.length > 0 && imageParts.length === parts.length
        ? imageParts.map((part) => ({ ...part, margin: [0, 0, 0, 6] }))
        : [{ text: parts, margin: [0, 0, 0, 6] }];
    }
    case 'list': {
      const items = node.children.map((item) => ({
        stack: item.children.flatMap((child) => block(child, images)),
      }));
      return [
        node.ordered === true
          ? { ol: items, start: node.start ?? 1, margin: [0, 0, 0, 6] }
          : { ul: items, margin: [0, 0, 0, 6] },
      ];
    }
    case 'blockquote':
      return [
        {
          stack: node.children.flatMap((child) => block(child, images)),
          color: '#666666',
          margin: [12, 0, 0, 6],
        },
      ];
    case 'code':
      return [
        {
          table: {
            widths: ['*'],
            body: [[{ text: node.value, fontSize: 9, preserveLeadingSpaces: true }]],
          },
          layout: {
            fillColor: CODE_BACKGROUND,
            hLineWidth: () => 0,
            vLineWidth: () => 0,
          },
          margin: [0, 0, 0, 6],
        },
      ];
    case 'table': {
      const body = node.children.map((row, rowIndex) =>
        row.children.map((cell) => ({
          text: inline(cell.children, images),
          bold: rowIndex === 0,
        })),
      );
      return [
        {
          table: { headerRows: 1, widths: node.children[0]?.children.map(() => '*') ?? [], body },
          margin: [0, 0, 0, 6],
        },
      ];
    }
    case 'thematicBreak':
      return [
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5 }],
          margin: [0, 6, 0, 6],
        },
      ];
    default:
      return 'value' in node ? [{ text: String(node.value), margin: [0, 0, 0, 6] }] : [];
  }
}

export async function markdownToPdfmakeBlob(
  markdown: string,
  allowedImages: AllowedDocumentImages = new Map(),
  title = 'Dokument',
): Promise<Blob> {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const images = await loadImages(root, allowedImages);

  const definition: TDocumentDefinitions = {
    info: { title },
    content: root.children.flatMap((node) => block(node, images)),
    defaultStyle: { font: 'Roboto', fontSize: 11 },
  };

  const [{ default: pdfMake }, { default: vfs }, symbolFont] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
    loadSymbolFont(),
  ]);
  pdfMake.addVirtualFileSystem({ ...vfs, [SYMBOL_FONT_FILE]: symbolFont });
  pdfMake.addFonts({
    [SYMBOL_FONT]: {
      normal: SYMBOL_FONT_FILE,
      bold: SYMBOL_FONT_FILE,
      italics: SYMBOL_FONT_FILE,
      bolditalics: SYMBOL_FONT_FILE,
    },
  });

  return pdfMake.createPdf(definition).getBlob();
}
