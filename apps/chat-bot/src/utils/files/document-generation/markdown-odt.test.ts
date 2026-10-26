import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { renderMarkdownOdt } from './markdown-odt';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

describe('renderMarkdownOdt', () => {
  it('creates the required ODT package parts with an uncompressed first mimetype entry', async () => {
    const odt = await renderMarkdownOdt('# Lesson\n\nA paragraph.');
    const fileNameLength = odt.readUInt16LE(26);
    const firstFileName = odt.subarray(30, 30 + fileNameLength).toString();

    expect(odt.readUInt32LE(0)).toBe(0x04034b50);
    expect(odt.readUInt16LE(8)).toBe(0);
    expect(firstFileName).toBe('mimetype');

    const zip = await JSZip.loadAsync(odt);
    await expect(zip.file('mimetype')?.async('text')).resolves.toBe(
      'application/vnd.oasis.opendocument.text',
    );
    expect(zip.file('content.xml')).not.toBeNull();
    expect(zip.file('styles.xml')).not.toBeNull();
    expect(zip.file('meta.xml')).not.toBeNull();
    expect(zip.file('META-INF/manifest.xml')).not.toBeNull();
  });

  it('embeds escaped content, tables, lists, and images with manifest entries', async () => {
    const odt = await renderMarkdownOdt(
      `# Science & Technology

- First
- Second

| Topic | Value |
| --- | --- |
| A < B | 42 |

![Diagram](attachment:image)`,
      {
        imageResolver: async () => ({
          data: ONE_PIXEL_PNG,
          mimeType: 'image/png',
          width: 1,
          height: 1,
        }),
      },
    );
    const zip = await JSZip.loadAsync(odt);
    const content = await zip.file('content.xml')?.async('text');
    const manifest = await zip.file('META-INF/manifest.xml')?.async('text');

    expect(content).toContain('Science &amp; Technology');
    expect(content).toContain('<text:list');
    expect(content).toContain('<table:table');
    expect(content).toContain('A &lt; B');
    expect(content).toContain('xlink:href="Pictures/image-1.png"');
    expect(zip.file('Pictures/image-1.png')).not.toBeNull();
    expect(manifest).toContain('manifest:full-path="Pictures/image-1.png"');
    expect(manifest).toContain('manifest:media-type="image/png"');
  });
});
