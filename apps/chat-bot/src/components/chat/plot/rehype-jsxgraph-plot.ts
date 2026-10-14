import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import { getCodeTitle, PLOT_LANGUAGE } from '@/utils/code-blocks';

export const JSXGRAPH_PLOT_HNAME = 'jsxgraph-plot';

// While streaming, the fence's language word is typed character by character, so it's only
// fully known once followed by a newline, i.e. once the node spans more than one line.
function isFenceHeaderComplete(position: Element['position']) {
  const start = position?.start.line;
  const end = position?.end.line;
  return start === undefined || end === undefined || end > start;
}

function getLanguage(code: Element): string | undefined {
  const className = code.properties.className;
  const classNames = Array.isArray(className) ? className : [];
  const languageClass = classNames.find(
    (name): name is string => typeof name === 'string' && name.startsWith('language-'),
  );
  return languageClass?.slice('language-'.length);
}

function getSource(code: Element): string {
  const [child] = code.children;
  return child?.type === 'text' ? child.value : '';
}

// Replaces `<pre><code class="language-jsxgraph-json">` with a standalone `<jsxgraph-plot>`
// element, so a dedicated react-markdown component handles rendering instead of the generic
// `code`/`pre` renderers, without the plot ending up nested in an invalid `<pre>` wrapper. While
// a fence's language is still streaming in, the block is rewritten to render nothing yet, rather
// than flashing a syntax-highlighted block for the wrong language.
export function rehypeJsxGraphPlot() {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || parent === undefined || index === undefined) {
        return;
      }
      const [code] = node.children;
      if (node.children.length !== 1 || code?.type !== 'element' || code.tagName !== 'code') {
        return;
      }

      const language = getLanguage(code);
      if (language === undefined) {
        return;
      }
      const complete = isFenceHeaderComplete(node.position);
      if (complete) {
        if (language !== PLOT_LANGUAGE) {
          return;
        }
      } else if (!PLOT_LANGUAGE.startsWith(language)) {
        // Can no longer become `jsxgraph-json` with more characters, so not a plot fence.
        return;
      }

      parent.children[index] = {
        type: 'element',
        tagName: JSXGRAPH_PLOT_HNAME,
        properties: {
          source: getSource(code),
          title: getCodeTitle(code.data?.meta),
          incomplete: !complete,
        },
        children: [],
      };
    });
  };
}
