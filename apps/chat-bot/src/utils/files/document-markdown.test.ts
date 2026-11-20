import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { remarkNormalizeHtml } from './document-markdown';

describe('remarkNormalizeHtml', () => {
  it('converts inline HTML and removes empty HTML nodes', () => {
    const tree = unified().use(remarkParse).parse('Before<br>after <span>text</span> <!---->');

    remarkNormalizeHtml()(tree);

    expect(tree.children[0]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'text', value: 'Before' },
        { type: 'break' },
        { type: 'text', value: 'after ' },
        { type: 'text', value: 'text' },
        { type: 'text', value: ' ' },
      ],
    });
  });

  it('wraps block HTML replacements in paragraphs', () => {
    const tree = unified()
      .use(remarkParse)
      .parse('> <div>Before<br>after</div>\n\n- <div>Item<br>continued</div>');

    remarkNormalizeHtml()(tree);

    expect(tree.children[0]?.type).toBe('blockquote');
    expect(tree.children[0]?.type === 'blockquote' && tree.children[0].children[0]?.type).toBe(
      'paragraph',
    );
    expect(tree.children[1]?.type).toBe('list');
    expect(
      tree.children[1]?.type === 'list' &&
        tree.children[1].children[0]?.type === 'listItem' &&
        tree.children[1].children[0].children[0]?.type,
    ).toBe('paragraph');
  });
});
