import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { getCodeTitle, PLOT_LANGUAGE } from '@/utils/code-blocks';

export const JSXGRAPH_PLOT_HNAME = 'jsxgraph-plot';

// While streaming, the fence's language word (e.g. `jsxgraph-json`) is typed in character by
// character, so mid-word it briefly parses as a different, shorter language. A fence's opening
// line is only fully known once it has been followed by a newline, which a growing mdast node
// reflects by already spanning more than one line.
function isFenceHeaderComplete(position: Root['children'][number]['position']) {
  const start = position?.start.line;
  const end = position?.end.line;
  return start === undefined || end === undefined || end > start;
}

// Rewrites fenced code blocks into a standalone `<jsxgraph-plot>` hast element, so plot rendering
// is handled by a dedicated react-markdown component instead of branching inside the generic
// `code`/`pre` renderers. While a fence's opening line is still streaming in, its eventual
// language is unknown (it could still turn into `jsxgraph-json`), so every such block is rewritten
// to render nothing yet rather than flashing a syntax-highlighted block for the wrong language.
export function remarkJsxGraphPlot() {
  return (tree: Root) => {
    visit(tree, 'code', (node) => {
      const complete = isFenceHeaderComplete(node.position);
      if (complete && node.lang !== PLOT_LANGUAGE) {
        return;
      }

      node.data = {
        ...node.data,
        hName: JSXGRAPH_PLOT_HNAME,
        hProperties: {
          source: node.value,
          title: getCodeTitle(node.meta ?? undefined),
          incomplete: !complete,
        },
      };
    });
  };
}
