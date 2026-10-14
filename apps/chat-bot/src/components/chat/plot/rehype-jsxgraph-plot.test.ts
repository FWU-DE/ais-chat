import { describe, it, expect } from 'vitest';
import type { Element, Root } from 'hast';
import { rehypeJsxGraphPlot, JSXGRAPH_PLOT_HNAME } from './rehype-jsxgraph-plot';

function preNode(overrides: Partial<Element> & { lang?: string; meta?: string }): Element {
  const { lang, meta, ...element } = overrides;
  const code: Element = {
    type: 'element',
    tagName: 'code',
    properties: { className: lang ? [`language-${lang}`] : [] },
    data: meta === undefined ? undefined : { meta },
    children: [{ type: 'text', value: '' }],
    ...element,
  };
  return {
    type: 'element',
    tagName: 'pre',
    properties: {},
    position: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
    children: [code],
  };
}

function transform(node: Element) {
  const tree: Root = { type: 'root', children: [node] };
  rehypeJsxGraphPlot()(tree);
  return tree.children[0] as Element;
}

describe('rehypeJsxGraphPlot', () => {
  it('marks a complete jsxgraph-json fence for plot rendering', () => {
    const result = transform(
      preNode({
        lang: 'jsxgraph-json',
        meta: 'title="Sine wave"',
        children: [{ type: 'text', value: '{"elements":[]}\n' }],
      }),
    );
    expect(result.tagName).toBe(JSXGRAPH_PLOT_HNAME);
    expect(result.properties).toEqual({
      source: '{"elements":[]}\n',
      title: 'Sine wave',
      incomplete: false,
    });
  });

  it('marks a still-streaming fence header as incomplete, regardless of its partial language', () => {
    // Start and end on the same line: the fence's info line hasn't fully arrived yet, so e.g.
    // `jsxgraph-js` could still turn into `jsxgraph-json`.
    const node = preNode({ lang: 'jsxgraph-js' });
    node.position = { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } };
    const result = transform(node);
    expect(result.tagName).toBe(JSXGRAPH_PLOT_HNAME);
    expect(result.properties).toMatchObject({ incomplete: true });
  });

  it('leaves a complete, non-plot fence untouched', () => {
    const result = transform(preNode({ lang: 'js' }));
    expect(result.tagName).toBe('pre');
  });

  it('does not rewrite an indented code block without a language', () => {
    const result = transform(preNode({}));
    expect(result.tagName).toBe('pre');
  });
});
