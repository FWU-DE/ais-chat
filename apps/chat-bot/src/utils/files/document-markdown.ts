import type { Paragraph, PhrasingContent, Root, RootContent } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';

const BREAK_TAG = /<br\s*\/?>/gi;
const ANY_TAG = /<[^>]*>/g;

// Convert the HTML that can occur in chat messages into phrasing nodes supported by the DOCX exporter.
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

function isPhrasingContainer(type: string) {
  return type === 'paragraph' || type === 'heading';
}

// The exports can't render raw HTML: <br> becomes a line break and all other tags are dropped.
export function remarkNormalizeHtml() {
  return (tree: Root) => {
    visit(tree, 'html', (node, index, parent) => {
      if (parent === undefined || index === undefined) {
        return;
      }
      const phrasing = htmlToPhrasing(node.value);
      const replacement: RootContent[] = isPhrasingContainer(parent.type)
        ? phrasing
        : phrasing.length > 0
          ? [{ type: 'paragraph', children: phrasing } satisfies Paragraph]
          : [];
      (parent.children as RootContent[]).splice(index, 1, ...replacement);
      return [SKIP, index + replacement.length];
    });
  };
}
