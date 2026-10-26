import type { Root, RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { z } from 'zod';

export const slideLayoutSchema = z.enum([
  'title',
  'content',
  'two-column',
  'image-left',
  'image-right',
]);

const documentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), level: z.number().int().min(2).max(6), text: z.string() }),
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({ type: z.literal('list'), ordered: z.boolean(), items: z.array(z.string()) }),
  z.object({ type: z.literal('table'), rows: z.array(z.array(z.string())) }),
  z.object({ type: z.literal('image'), source: z.string(), alt: z.string() }),
  z.object({ type: z.literal('code'), language: z.string().optional(), value: z.string() }),
  z.object({ type: z.literal('page-break') }),
]);

export const markdownDocumentSchema = z.object({
  title: z.string().min(1),
  blocks: z.array(documentBlockSchema),
});

export type SlideLayout = z.infer<typeof slideLayoutSchema>;
export type DocumentBlock = z.infer<typeof documentBlockSchema>;
export type MarkdownDocument = z.infer<typeof markdownDocumentSchema>;

export type ResolvedDocumentImage = {
  data: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
};

export type DocumentImageResolver = (source: string) => Promise<ResolvedDocumentImage>;

function getText(node: RootContent): string {
  if ('value' in node && typeof node.value === 'string') {
    return node.value;
  }

  if ('children' in node) {
    return node.children.map((child) => getText(child as RootContent)).join('');
  }

  return '';
}

function getImages(node: RootContent): Extract<RootContent, { type: 'image' }>[] {
  if (node.type === 'image') {
    return [node];
  }

  if (!('children' in node)) {
    return [];
  }

  return node.children.flatMap((child) => getImages(child as RootContent));
}

export function parseMarkdownDocument(markdown: string): MarkdownDocument {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  let title = 'Document';
  const blocks: DocumentBlock[] = [];

  for (const node of root.children) {
    if (node.type === 'heading') {
      const text = getText(node).trim();
      if (node.depth === 1 && text !== '') {
        title = text;
      } else if (text !== '') {
        blocks.push({ type: 'heading', level: node.depth, text });
      }
      continue;
    }

    if (node.type === 'paragraph') {
      const images = getImages(node);
      const text = node.children
        .filter((child) => child.type !== 'image')
        .map((child) => getText(child as RootContent))
        .join('')
        .trim();

      if (text !== '') {
        blocks.push({ type: 'paragraph', text });
      }
      blocks.push(
        ...images.map((image) => ({
          type: 'image' as const,
          source: image.url,
          alt: image.alt ?? '',
        })),
      );
      continue;
    }

    if (node.type === 'list') {
      blocks.push({
        type: 'list',
        ordered: node.ordered ?? false,
        items: node.children.map((item) => getText(item).trim()).filter(Boolean),
      });
      continue;
    }

    if (node.type === 'table') {
      blocks.push({
        type: 'table',
        rows: node.children.map((row) => row.children.map((cell) => getText(cell).trim())),
      });
      continue;
    }

    if (node.type === 'code') {
      blocks.push({ type: 'code', language: node.lang ?? undefined, value: node.value });
      continue;
    }

    if (node.type === 'blockquote') {
      const text = getText(node).trim();
      if (text !== '') {
        blocks.push({ type: 'paragraph', text });
      }
      continue;
    }

    if (node.type === 'thematicBreak') {
      blocks.push({ type: 'page-break' });
    }
  }

  return markdownDocumentSchema.parse({ title, blocks });
}
