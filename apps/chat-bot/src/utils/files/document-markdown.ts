import type { Paragraph, PhrasingContent, Root, RootContent } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';

import { type AllowedDocumentImages, findAllowedImageUrl } from './document-images';

const BREAK_TAG = /<br\s*\/?>/gi;
const ANY_TAG = /<[^>]*>/g;

function htmlToPhrasing(html: string): PhrasingContent[] {
  const nodes: PhrasingContent[] = [];
  html.split(BREAK_TAG).forEach((segment, index) => {
    if (index > 0) {
      nodes.push({ type: 'break' });
    }
    const text = segment.replace(ANY_TAG, '');
    if (text.trim() !== '') {
      nodes.push({ type: 'text', value: text });
    }
  });
  return nodes;
}

// The exports can't render raw HTML: <br> becomes a line break and all other tags are dropped.
export function remarkNormalizeHtml() {
  return (tree: Root) => {
    visit(tree, 'html', (node, index, parent) => {
      if (parent === undefined || index === undefined) {
        return;
      }
      const phrasing = htmlToPhrasing(node.value);
      const replacement: RootContent[] =
        parent.type === 'root'
          ? phrasing.length > 0
            ? [{ type: 'paragraph', children: phrasing } satisfies Paragraph]
            : []
          : phrasing;
      (parent.children as RootContent[]).splice(index, 1, ...replacement);
      return [SKIP, index + replacement.length];
    });
  };
}

export function remarkRemoveUnapprovedImages(allowedImages: AllowedDocumentImages) {
  return (tree: Root) => {
    visit(tree, ['image', 'imageReference'], (node, index, parent) => {
      if (parent === undefined || index === undefined) {
        return;
      }
      const source = node.type === 'image' ? node.url : undefined;
      if (source !== undefined && findAllowedImageUrl(source, allowedImages) !== undefined) {
        return;
      }
      parent.children.splice(index, 1);
      return [SKIP, index];
    });
  };
}

const SYMBOL_REPLACEMENTS: Record<string, string> = {
  '✅': '✔',
  '❌': '✘',
  '⬜': '☐',
  '⭐': '★',
};

// No font has color emoji: map the common ones to plain symbols and drop the rest.
export function simplifyEmoji(text: string) {
  return text
    .replace(/[✅❌⬜⭐]/gu, (emoji) => SYMBOL_REPLACEMENTS[emoji] ?? '')
    .replace(/\uFE0F/g, '')
    .replace(/\p{Emoji_Presentation}/gu, '');
}
