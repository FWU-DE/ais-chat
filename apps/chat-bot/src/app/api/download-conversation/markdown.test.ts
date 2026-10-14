import { markdownToDocx } from './markdown';
import {
  Paragraph,
  HeadingLevel,
  TextRun,
  TableCell,
  Table,
  TableRow,
  AlignmentType,
  WidthType,
} from 'docx';
import { describe, it, expect } from 'vitest';

const FONT_SIZE = 22;

expect.extend({
  toMatchParagraph(
    received: Paragraph | undefined | Table,
    expected: Paragraph | undefined | Table,
  ) {
    const receivedJSON = JSON.stringify(received);
    const expectedJSON = JSON.stringify(expected);
    const pass = receivedJSON === expectedJSON;
    if (pass) {
      return {
        message: () => `expected ${receivedJSON} not to equal ${expectedJSON}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${receivedJSON} to equal ${expectedJSON}`,
        pass: false,
      };
    }
  },
});

describe('markdownToDocx', () => {
  it('should convert a single heading to a Paragraph with HeadingLevel', () => {
    const markdown = '# First Level Heading';
    const result = markdownToDocx(markdown);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'First Level Heading', size: FONT_SIZE })],
        heading: HeadingLevel.HEADING_1,
      }),
    );
  });

  it('should convert multiple headings and paragraphs correctly', () => {
    const markdown = `
  # Heading 1

  This is a paragraph.

  ## Heading 2

  Another paragraph.
    `;
    const result = markdownToDocx(markdown);

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'Heading 1', size: FONT_SIZE })],
        heading: HeadingLevel.HEADING_1,
      }),
    );
    expect(result[1]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'This is a paragraph.', size: FONT_SIZE })],
      }),
    );
    expect(result[2]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'Heading 2', size: FONT_SIZE })],
        heading: HeadingLevel.HEADING_2,
      }),
    );
    expect(result[3]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'Another paragraph.', size: FONT_SIZE })],
      }),
    );
  });

  it('should handle inline bold and italic text', () => {
    const markdown = 'This is **bold** and *italic*.';
    const result = markdownToDocx(markdown);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchParagraph(
      new Paragraph({
        children: [
          new TextRun({ text: 'This is ', size: FONT_SIZE }),
          new TextRun({ text: 'bold', bold: true, size: FONT_SIZE }),
          new TextRun({ text: ' and ', size: FONT_SIZE }),
          new TextRun({ text: 'italic', italics: true, size: FONT_SIZE }),
          new TextRun({ text: '.', size: FONT_SIZE }),
        ],
      }),
    );
  });

  it('should ignore empty lines and unsupported tokens', () => {
    const markdown = `
  # Heading

  This is a paragraph.

  ---

  Another paragraph.
  `;
    const result = markdownToDocx(markdown);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'Heading', size: FONT_SIZE })],
        heading: HeadingLevel.HEADING_1,
      }),
    );
    expect(result[1]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'This is a paragraph.', size: FONT_SIZE })],
      }),
    );
    expect(result[2]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'Another paragraph.', size: FONT_SIZE })],
      }),
    );
  });

  it('should handle mixed content in the markdown', () => {
    const markdown = `
  # Heading 1

  This is a paragraph with **bold** text.

  Another paragraph.

  ## Heading 2

  More text here.
  `;
    const result = markdownToDocx(markdown);

    expect(result).toHaveLength(5);
    expect(result[0]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'Heading 1', size: FONT_SIZE })],
        heading: HeadingLevel.HEADING_1,
      }),
    );
    expect(result[1]).toMatchParagraph(
      new Paragraph({
        children: [
          new TextRun({ text: 'This is a paragraph with ', size: FONT_SIZE }),
          new TextRun({ text: 'bold', bold: true, size: FONT_SIZE }),
          new TextRun({ text: ' text.', size: FONT_SIZE }),
        ],
      }),
    );
    expect(result[2]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'Another paragraph.', size: FONT_SIZE })],
      }),
    );

    expect(result[3]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'Heading 2', size: FONT_SIZE })],
        heading: HeadingLevel.HEADING_2,
      }),
    );
    expect(result[4]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'More text here.', size: FONT_SIZE })],
      }),
    );
  });

  it('should handle basic unordered lists', () => {
    const markdown = `- listitem 1
- listitem2
- listitem3
`;
    const result = markdownToDocx(markdown);
    expect(result).toHaveLength(5);
    expect(result[1]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'listitem 1', size: FONT_SIZE })],
        numbering: { level: 0, reference: 'dgptBullet' },
        run: { size: FONT_SIZE },
      }),
    );
    expect(result[2]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'listitem2', size: FONT_SIZE })],
        numbering: { level: 0, reference: 'dgptBullet' },
        run: { size: FONT_SIZE },
      }),
    );
    expect(result[3]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'listitem3', size: FONT_SIZE })],
        numbering: { level: 0, reference: 'dgptBullet' },
        run: { size: FONT_SIZE },
      }),
    );
  });

  it('should handle ordered lists', () => {
    const markdown = `1. ordered item 1
  2. ordered item 2
  3. ordered item 3`;

    const result = markdownToDocx(markdown);

    expect(result).toHaveLength(5);

    expect(result[1]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'ordered item 1', size: FONT_SIZE })],
        numbering: { reference: 'dgptNumbering', level: 0 },
        run: { size: FONT_SIZE },
      }),
    );

    expect(result[2]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'ordered item 2', size: FONT_SIZE })],
        numbering: { reference: 'dgptNumbering', level: 0 },
        run: { size: FONT_SIZE },
      }),
    );

    expect(result[3]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'ordered item 3', size: FONT_SIZE })],
        numbering: { reference: 'dgptNumbering', level: 0 },
        run: { size: FONT_SIZE },
      }),
    );
  });

  it('should handle nested lists', () => {
    const markdown = `- top-level item 1
  - nested item 1.1
  - nested item 1.2
- top-level item 2`;

    const result = markdownToDocx(markdown);

    expect(result).toHaveLength(8);
    expect(result[1]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'top-level item 1', size: FONT_SIZE })],
        numbering: { level: 0, reference: 'dgptBullet' },
        run: { size: FONT_SIZE },
      }),
    );

    expect(result[3]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'nested item 1.1', size: FONT_SIZE })],
        numbering: { level: 1, reference: 'dgptBullet' },
        run: { size: FONT_SIZE },
      }),
    );

    expect(result[4]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'nested item 1.2', size: FONT_SIZE })],
        numbering: { level: 1, reference: 'dgptBullet' },
        run: { size: FONT_SIZE },
      }),
    );

    expect(result[6]).toMatchParagraph(
      new Paragraph({
        children: [new TextRun({ text: 'top-level item 2', size: FONT_SIZE })],
        numbering: { level: 0, reference: 'dgptBullet' },
        run: { size: FONT_SIZE },
      }),
    );
  });

  it('should handle tables with proper hierarchy', () => {
    const markdown = `| Header 1    | Header 2    |
  | ------------ | ----------- |
  | Row 1 Cell 1 | Row 1 Cell 2 |
  | Row 2 Cell 1 | Row 2 Cell 2 |`;

    const result = markdownToDocx(markdown);

    // Ensure the result contains a single table
    expect(result).toHaveLength(3);

    const expectedTable = new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: 'Header 1', size: FONT_SIZE })] }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: 'Header 2', size: FONT_SIZE })] }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Row 1 Cell 1', size: FONT_SIZE })],
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Row 1 Cell 2', size: FONT_SIZE })],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Row 2 Cell 1', size: FONT_SIZE })],
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Row 2 Cell 2', size: FONT_SIZE })],
                }),
              ],
            }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      style: 'TableGrid',
    });

    const resultJSON = JSON.stringify(result[1]);
    const expectedJSON = JSON.stringify(expectedTable);

    expect(resultJSON).toBe(expectedJSON);
  });

  it('keep normal links', async () => {
    const markdown_with_sources = `http://192.168.100.105/teampasswordmanager/index.php/pwd/view/381`;
    const result = markdownToDocx(markdown_with_sources);
    console.log('result', result);

    expect(result[0]).toMatchParagraph(
      new Paragraph({
        children: [
          new TextRun({
            text: 'http://192.168.100.105/teampasswordmanager/index.php/pwd/view/381',
            size: FONT_SIZE,
          }),
        ],
      }),
    );
  });

  it('should remove custom web search links with <source>', () => {
    const markdown_with_sources = `test[<source>„Die One-Pot-Challenge: Topf vs.“ (Schreiner, Jumbo, Kintrup) – Buch gebraucht kaufen – A02D365c01ZZu</source>](https://www.booklooker.de/B%C3%BCcher/Jumbo-Schreiner+Die-One-Pot-Challenge-Topf-vs-Pfanne-vs-Blech-Wer-gewinnt-Das-Kochtrio-moderiert-von/id/A02D365c01ZZu)[<source>Jumbo Schreiner: 7 Geheimnisse vom XXL-Tester, die du noch nicht kennst! | Wunderweib</source>](https://www.wunderweib.de/jumbo-schreiner-7-geheimnisse-vom-xxl-tester-die-du-noch-nicht-kennst-111902.html)
`;
    const result = markdownToDocx(markdown_with_sources);
    console.log('result', result);

    expect(result[0]).toMatchParagraph(
      new Paragraph({
        children: [
          new TextRun({
            text: 'test',
            size: FONT_SIZE,
          }),
        ],
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('should handle code blocks correctly', () => {
    const markdown = `\`\`\`python
    # Ein einfacher Python-Code, der eine Begrüßungsnachricht ausgibt
    
    name = "Alex"
    print(f"Hallo, {name}! Willkommen zu deinem ersten Python-Programm.")
    \`\`\``;

    const result = markdownToDocx(markdown);

    // Ensure the result includes pre-spacing, language row, code block, and post-spacing
    expect(result).toHaveLength(4);
    const expectedLanguageRowTable = new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'python',
                      font: 'Courier New',
                      color: 'EAEBEB',
                      bold: false,
                      size: FONT_SIZE,
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 120, after: 120 },
                }),
              ],
              shading: { fill: '2F3237' },
            }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      style: 'TableGrid',
    });

    // Compare the language row table (second item in result)
    const resultLanguageRowTableJSON = JSON.stringify(result[1]);
    const expectedLanguageRowTableJSON = JSON.stringify(expectedLanguageRowTable);
    expect(resultLanguageRowTableJSON).toBe(expectedLanguageRowTableJSON);

    // Code block: each line wrapped in a paragraph within a table cell
    const codeLines = [
      '    # Ein einfacher Python-Code, der eine Begrüßungsnachricht ausgibt',
      '    ',
      '    name = "Alex"',
      '    print(f"Hallo, {name}! Willkommen zu deinem ersten Python-Programm.")',
      '    ```',
    ];

    const codeBlockRow = new TableRow({
      children: [
        new TableCell({
          children: [
            ...codeLines.map((line) => {
              return new Paragraph({
                children: [
                  new TextRun({
                    text: line,
                    font: 'Courier New',
                    color: 'D4DCE9',
                    size: FONT_SIZE,
                    bold: false,
                  }),
                ],
                alignment: AlignmentType.LEFT,
                spacing: { before: 200, after: 200 },
              });
            }),
          ],
          shading: { fill: '011627' },
        }),
      ],
    });

    // Validate the code block table (third item in result)
    const expectedCodeBlockTable = new Table({
      rows: [codeBlockRow],
      width: { size: 100, type: WidthType.PERCENTAGE },
      style: 'TableGrid',
    });

    const resultCodeBlockTableJSON = JSON.stringify(result[2]);
    const expectedCodeBlockTableJSON = JSON.stringify(expectedCodeBlockTable);
    expect(resultCodeBlockTableJSON).toBe(expectedCodeBlockTableJSON);
  });

  it('skips jsxgraph-json plot blocks', () => {
    const markdown = `Before\n\n\`\`\`jsxgraph-json title="Sine wave"\n{"elements":[["point",[0,0]]]}\n\`\`\`\n\nAfter`;

    const result = markdownToDocx(markdown);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('elements');
    expect(serialized).toContain('Before');
    expect(serialized).toContain('After');
  });
});
