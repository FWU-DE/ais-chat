import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildPresentationSlides, renderMarkdownPptx } from './markdown-pptx';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

describe('markdown PPTX generation', () => {
  it('supports the five layouts and splits overflowing sections', () => {
    const markdown = `# Lesson

## Intro {layout=content}
Short introduction.

## Comparison {layout=two-column}
${Array.from({ length: 12 }, (_, index) => `- Point ${index + 1}`).join('\n')}

## Diagram {layout=image-left}
Explanation.

![Diagram](attachment:image)

## Result {layout=image-right}
Summary.

![Result](attachment:image)`;

    const slides = buildPresentationSlides(markdown);

    expect(slides[0]?.layout).toBe('title');
    expect(slides.some((slide) => slide.layout === 'content')).toBe(true);
    expect(slides.some((slide) => slide.layout === 'two-column')).toBe(true);
    expect(slides.some((slide) => slide.layout === 'image-left')).toBe(true);
    expect(slides.some((slide) => slide.layout === 'image-right')).toBe(true);
    expect(slides.some((slide) => slide.continuation)).toBe(true);
  });

  it('creates a compatible PPTX package with slides and embedded media', async () => {
    const pptx = await renderMarkdownPptx(
      '# Lesson\n\n## Diagram {layout=image-right}\n\nA generated diagram.\n\n![Diagram](attachment:image)',
      {
        imageResolver: async () => ({
          data: ONE_PIXEL_PNG,
          mimeType: 'image/png',
          width: 1,
          height: 1,
        }),
      },
    );
    const zip = await JSZip.loadAsync(pptx);

    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('ppt/presentation.xml')).not.toBeNull();
    expect(zip.file('ppt/slides/slide1.xml')).not.toBeNull();
    expect(zip.file('ppt/slides/slide2.xml')).not.toBeNull();
    expect(Object.keys(zip.files).some((path) => path.startsWith('ppt/media/'))).toBe(true);
  });
});
