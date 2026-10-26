import JSZip from 'jszip';
import type { DocumentBlock, DocumentImageResolver } from './markdown-document';
import { parseMarkdownDocument } from './markdown-document';

const ODT_MIME_TYPE = 'application/vnd.oasis.opendocument.text';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function imageDimensions(width: number, height: number) {
  const widthInCm = (width / 96) * 2.54;
  const heightInCm = (height / 96) * 2.54;
  const scale = Math.min(1, 16 / widthInCm, 20 / heightInCm);
  return {
    width: Math.max(1, widthInCm * scale).toFixed(2),
    height: Math.max(1, heightInCm * scale).toFixed(2),
  };
}

function renderTextBlock(block: Exclude<DocumentBlock, { type: 'image' }>, tableIndex: number) {
  if (block.type === 'heading') {
    return `<text:h text:outline-level="${block.level}">${escapeXml(block.text)}</text:h>`;
  }
  if (block.type === 'paragraph') {
    return `<text:p>${escapeXml(block.text)}</text:p>`;
  }
  if (block.type === 'list') {
    const styleName = block.ordered ? 'Numbering' : 'Bullet';
    return `<text:list text:style-name="${styleName}">${block.items
      .map((item) => `<text:list-item><text:p>${escapeXml(item)}</text:p></text:list-item>`)
      .join('')}</text:list>`;
  }
  if (block.type === 'table') {
    return `<table:table table:name="Table${tableIndex}">${block.rows
      .map(
        (row) =>
          `<table:table-row>${row
            .map(
              (cell) =>
                `<table:table-cell office:value-type="string"><text:p>${escapeXml(cell)}</text:p></table:table-cell>`,
            )
            .join('')}</table:table-row>`,
      )
      .join('')}</table:table>`;
  }
  if (block.type === 'code') {
    return `<text:p text:style-name="Code">${escapeXml(block.value)}</text:p>`;
  }
  return '<text:p text:style-name="PageBreak"/>';
}

function contentXml(title: string, body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:xlink="http://www.w3.org/1999/xlink"
 office:version="1.3">
 <office:automatic-styles>
  <style:style style:name="Image" style:family="graphic">
   <style:graphic-properties style:horizontal-pos="center" style:horizontal-rel="paragraph"/>
  </style:style>
  <style:style style:name="Code" style:family="paragraph">
   <style:text-properties style:font-name="Liberation Mono"/>
  </style:style>
  <style:style style:name="PageBreak" style:family="paragraph">
   <style:paragraph-properties fo:break-after="page"/>
  </style:style>
 </office:automatic-styles>
 <office:body>
  <office:text>
   <text:h text:outline-level="1">${escapeXml(title)}</text:h>
   ${body}
  </office:text>
 </office:body>
</office:document-content>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 office:version="1.3">
 <office:styles>
  <text:list-style style:name="Bullet"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/></text:list-style>
  <text:list-style style:name="Numbering"><text:list-level-style-number text:level="1" style:num-format="1"/></text:list-style>
  <style:default-style style:family="paragraph"><style:text-properties fo:font-size="11pt"/></style:default-style>
 </office:styles>
</office:document-styles>`;

function metadataXml(title: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 office:version="1.3">
 <office:meta><dc:title>${escapeXml(title)}</dc:title><meta:generator>AIS.chat</meta:generator></office:meta>
</office:document-meta>`;
}

function manifestXml(images: Array<{ path: string; mimeType: string }>) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
 <manifest:file-entry manifest:full-path="/" manifest:media-type="${ODT_MIME_TYPE}" manifest:version="1.3"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
 ${images.map((image) => `<manifest:file-entry manifest:full-path="${image.path}" manifest:media-type="${image.mimeType}"/>`).join('\n ')}
</manifest:manifest>`;
}

export async function renderMarkdownOdt(
  markdown: string,
  { imageResolver }: { imageResolver?: DocumentImageResolver } = {},
): Promise<Buffer> {
  const document = parseMarkdownDocument(markdown);
  const zip = new JSZip();
  const body: string[] = [];
  const images: Array<{ path: string; mimeType: string }> = [];
  let imageIndex = 0;
  let tableIndex = 0;

  zip.file('mimetype', ODT_MIME_TYPE, { compression: 'STORE' });

  for (const block of document.blocks) {
    if (block.type !== 'image') {
      tableIndex += block.type === 'table' ? 1 : 0;
      body.push(renderTextBlock(block, tableIndex));
      continue;
    }

    if (imageResolver === undefined) {
      throw new Error(`No image resolver configured for ${block.source}`);
    }
    const image = await imageResolver(block.source);
    imageIndex += 1;
    const extension = image.mimeType === 'image/png' ? 'png' : 'jpg';
    const path = `Pictures/image-${imageIndex}.${extension}`;
    const dimensions = imageDimensions(image.width, image.height);
    zip.file(path, image.data);
    images.push({ path, mimeType: image.mimeType });
    body.push(
      `<text:p><draw:frame draw:style-name="Image" draw:name="Image${imageIndex}" text:anchor-type="paragraph" svg:width="${dimensions.width}cm" svg:height="${dimensions.height}cm"><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`,
    );
  }

  zip.file('content.xml', contentXml(document.title, body.join('\n')));
  zip.file('styles.xml', STYLES_XML);
  zip.file('meta.xml', metadataXml(document.title));
  zip.folder('META-INF')?.file('manifest.xml', manifestXml(images));

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: ODT_MIME_TYPE,
  });
}
