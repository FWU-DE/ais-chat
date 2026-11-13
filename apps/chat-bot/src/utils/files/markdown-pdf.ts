import { logWarning } from '@shared/logging';
import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import type { PdfOptions } from 'remark-pdf';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

import {
  type AllowedDocumentImages,
  findAllowedImageUrl,
  loadDocumentImage,
} from './document-images';
import { remarkNormalizeHtml, simplifyEmoji } from './document-markdown';

type PdfFonts = NonNullable<PdfOptions['fonts']>;

const FONT_DIRECTORY = '/fonts';

// Barlow has neither arrows nor checkboxes and similar symbols. Fallback fonts are only loaded
// when the text contains matching characters.
const FALLBACK_FONTS = [
  {
    name: 'Noto Sans Symbols',
    file: 'noto-sans-symbols/NotoSansSymbols.ttf',
    characters: /[\u2190-\u21ff]+/g,
  },
  {
    name: 'Noto Sans Symbols 2',
    file: 'noto-sans-symbols-2/NotoSansSymbols2-subset.ttf',
    characters: /[\u2500-\u27bf\u2b00-\u2bff]+/g,
  },
];

const fontCache = new Map<string, Promise<Uint8Array>>();

function loadFont(fileName: string) {
  let font = fontCache.get(fileName);
  if (font === undefined) {
    font = fetch(`${FONT_DIRECTORY}/${fileName}`).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load font ${fileName}: ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    });
    font.catch(() => fontCache.delete(fileName));
    fontCache.set(fileName, font);
  }
  return font;
}

async function loadBarlowFonts(): Promise<PdfFonts> {
  const [regular, bold, italic, boldItalic, semiBold] = await Promise.all([
    loadFont('barlow/Barlow-Regular.ttf'),
    loadFont('barlow/Barlow-Bold.ttf'),
    loadFont('barlow/Barlow-Italic.ttf'),
    loadFont('barlow/Barlow-BoldItalic.ttf'),
    loadFont('barlow/Barlow-SemiBold.ttf'),
  ]);

  return [
    'Courier',
    { name: 'Barlow', normal: regular, bold, italic, bolditalic: boldItalic },
    {
      name: 'Barlow SemiBold',
      normal: semiBold,
      bold: semiBold,
      italic: semiBold,
      bolditalic: semiBold,
    },
  ];
}

async function loadFallbackFonts(markdown: string) {
  const needed = FALLBACK_FONTS.filter(({ characters }) =>
    new RegExp(characters.source).test(markdown),
  );
  const fonts = await Promise.all(
    needed.map(async ({ name, file }) => {
      const data = await loadFont(file);
      return { name, normal: data, bold: data, italic: data, bolditalic: data };
    }),
  );
  const textStyle = needed.map(
    ({ characters, name }): NonNullable<PdfOptions['textStyle']>[number] => [
      characters,
      { font: name },
    ],
  );
  return { fonts, textStyle };
}

// Only images the user uploaded may be embedded. Everything else (URLs, web search results, image
// references) is dropped, and allowed ones are pointed at their own URL.
function remarkAllowUploadedImages(allowedImages: AllowedDocumentImages) {
  return (tree: Root) => {
    visit(tree, ['image', 'imageReference'], (node, index, parent) => {
      if (parent === undefined || index === undefined) {
        return;
      }
      const url = node.type === 'image' ? findAllowedImageUrl(node.url, allowedImages) : undefined;
      if (node.type === 'image' && url !== undefined) {
        node.url = url;
        return;
      }
      parent.children.splice(index, 1);
      return [SKIP, index];
    });
  };
}

// Mirrors the DOCX export so both formats look alike.
async function createPdfOptions(markdown: string): Promise<PdfOptions> {
  const options: PdfOptions = { size: 'A4', margin: 72, spacing: 4, thematicBreak: 'line' };

  try {
    const fonts = await loadBarlowFonts();
    const fallback = await loadFallbackFonts(markdown);
    fonts.push(...fallback.fonts);

    return {
      ...options,
      fonts,
      textStyle: fallback.textStyle.length > 0 ? fallback.textStyle : undefined,
      styles: {
        default: { font: 'Barlow', fontSize: 11 },
        head1: { font: 'Barlow SemiBold', fontSize: 16 },
        head2: { font: 'Barlow SemiBold', fontSize: 13 },
        head3: { font: 'Barlow', fontSize: 11, bold: false, italic: true, color: '666666' },
        head4: { font: 'Barlow SemiBold', fontSize: 11 },
        head5: { font: 'Barlow SemiBold', fontSize: 11 },
        head6: { font: 'Barlow SemiBold', fontSize: 11 },
        link: { color: '2F80ED' },
        inlineCode: { font: 'Courier' },
        code: { font: 'Courier', fontSize: 9 },
      },
    };
  } catch (error) {
    logWarning('PDF fonts could not be loaded, falling back to the default font', {
      message: error instanceof Error ? error.message : String(error),
    });
    return options;
  }
}

export async function markdownToPdfBlob(
  markdown: string,
  allowedImages: AllowedDocumentImages = new Map(),
): Promise<Blob> {
  // remark-pdf bundles pdfkit, so it is only loaded when a PDF is actually requested.
  const { default: remarkPdf } = await import('remark-pdf');
  const text = simplifyEmoji(markdown);
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkNormalizeHtml)
    .use(remarkAllowUploadedImages, allowedImages)
    .use(remarkPdf, { ...(await createPdfOptions(text)), loadImage: loadDocumentImage })
    .process(text);

  return new Blob([await file.result], { type: 'application/pdf' });
}
