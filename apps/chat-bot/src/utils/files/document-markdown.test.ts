import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { remarkNormalizeHtml } from './document-markdown';

describe('remarkNormalizeHtml', () => {
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
