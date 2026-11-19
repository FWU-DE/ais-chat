import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { createAllowedImages } from './document-images';
import { remarkNormalizeHtml, remarkRemoveUnapprovedImages } from './document-markdown';

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

describe('remarkRemoveUnapprovedImages', () => {
  it('keeps approved images and removes unapproved images', () => {
    const tree = unified()
      .use(remarkParse)
      .parse('![approved](approved.png) ![unapproved](other.png)');
    const allowedImages = createAllowedImages([{ name: 'approved.png', url: '/img/approved' }]);

    remarkRemoveUnapprovedImages(allowedImages)(tree);

    expect(tree.children[0]).toMatchObject({
      children: [
        { type: 'image', url: 'approved.png' },
        { type: 'text', value: ' ' },
      ],
    });
  });

  it('removes reference images without an approved definition', () => {
    const tree = unified().use(remarkParse).parse('![missing][image-id]\n\n[image-id]: other.png');

    remarkRemoveUnapprovedImages(new Map())(tree);

    expect(tree.children[0]).toMatchObject({ children: [] });
  });
});
