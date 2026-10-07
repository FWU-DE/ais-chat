import { describe, it, expect } from 'vitest';
import type { Code, Root } from 'mdast';
import { remarkJsxGraphPlot, JSXGRAPH_PLOT_HNAME } from './remark-jsxgraph-plot';

function codeNode(overrides: Partial<Code>): Code {
  return {
    type: 'code',
    value: '',
    position: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
    ...overrides,
  };
}

function transform(node: Code) {
  const tree: Root = { type: 'root', children: [node] };
  remarkJsxGraphPlot()(tree);
  return tree.children[0] as Code;
}

describe('remarkJsxGraphPlot', () => {
  it('marks a complete jsxgraph-json fence for plot rendering', () => {
    const node = transform(
      codeNode({ lang: 'jsxgraph-json', meta: 'title="Sine wave"', value: '{"elements":[]}' }),
    );
    expect(node.data?.hName).toBe(JSXGRAPH_PLOT_HNAME);
    expect(node.data?.hProperties).toEqual({
      source: '{"elements":[]}',
      title: 'Sine wave',
      incomplete: false,
    });
  });

  it('marks a still-streaming fence header as incomplete, regardless of its partial language', () => {
    // Start and end on the same line: the fence's info line hasn't fully arrived yet, so e.g.
    // `jsxgraph-js` could still turn into `jsxgraph-json`.
    const node = transform(
      codeNode({
        lang: 'jsxgraph-js',
        position: { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } },
      }),
    );
    expect(node.data?.hName).toBe(JSXGRAPH_PLOT_HNAME);
    expect(node.data?.hProperties).toMatchObject({ incomplete: true });
  });

  it('leaves a complete, non-plot fence untouched', () => {
    const node = transform(codeNode({ lang: 'js', value: 'console.log(1);' }));
    expect(node.data).toBeUndefined();
  });
});
