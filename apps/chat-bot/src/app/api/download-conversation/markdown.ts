import MarkdownIt from 'markdown-it';
import { PLOT_LANGUAGE } from '@/utils/code-blocks';
import {
  Paragraph,
  HeadingLevel,
  TextRun,
  IParagraphPropertiesOptions,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} from 'docx';

const md = new MarkdownIt();
const fontSize = 22;

type Token = ReturnType<typeof md.parse>[number];

function processInlineTokens(children: Token[]): TextRun[] {
  const runs: TextRun[] = [];
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const nextChild = children[i + 1];

    if (child === undefined) continue;

    if (child.type === 'text') {
      if (child.content.includes('<source>') && child.content.includes('</source>')) {
        continue;
      }
      runs.push(new TextRun({ text: child.content, size: fontSize }));
    } else if (child.type === 'strong_open') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      nextChild !== undefined &&
        runs.push(new TextRun({ bold: true, text: nextChild.content, size: fontSize }));
      i += 1;
    } else if (child.type === 'em_open') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      nextChild !== undefined &&
        runs.push(new TextRun({ italics: true, text: nextChild.content, size: fontSize }));
      i += 1;
    } else if (child.type === 'link_open') {
      if (nextChild?.type === 'text' && nextChild?.content.includes('<source>')) {
        continue;
      }
      if (child.attrs && child.attrs[0]) {
        runs.push(
          new TextRun({ text: String(child.attrs[0][1]), size: fontSize, color: '2F80ED' }),
        );
      }
    }
  }
  return runs;
}

function addCodingLanguage(sections: SectionType[], tokenInfo: string | undefined) {
  if (tokenInfo) {
    const infoRow = new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: tokenInfo,
                  font: 'Courier New',
                  color: 'EAEBEB',
                  bold: false,
                  size: fontSize,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 120 },
            }),
          ],
          shading: { fill: '2F3237' },
        }),
      ],
    });
    sections.push(
      new Table({
        rows: [infoRow],
        width: { size: 100, type: WidthType.PERCENTAGE },
        style: 'TableGrid',
      }),
    );
  }
}

function createCodeBlock(lines: string[], color: string = 'D4DCE9'): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [
          ...lines.map((line) => {
            return new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  font: 'Courier New',
                  color: color,
                  size: fontSize,
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
}

type ListType = 'bullet' | 'numbering';
type SectionType = Paragraph | Table;

export function markdownToDocx(markdownString: string): SectionType[] {
  const tokens = md.parse(markdownString, {});
  const sections: SectionType[] = [];
  const currentListTypes: Array<ListType> = [];
  let currentTableRows: TableRow[] = [];
  let currentTableCells: TableCell[] = [];
  const spacing = new Paragraph({
    children: [new TextRun({ text: '', size: fontSize })],
    spacing: { before: 0, after: 0 },
  });
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    const nextToken = tokens[i + 1];
    if (token.type === 'heading_open') {
      const level = parseInt(token.tag.slice(1), 10);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      nextToken !== undefined &&
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: nextToken.content,
                size: fontSize,
              }),
            ],
            heading: fromNumberToHeadingLevel(level),
          }),
        );
      i += 1;
    } else if (token.type === 'paragraph_open') {
      const inlineToken = tokens[i + 1];
      if (inlineToken?.type === 'inline') {
        const children = processInlineTokens(inlineToken.children ?? []);
        sections.push(new Paragraph({ children }));
      }
      i += 1;
    } else if (token.type === 'ordered_list_open') {
      sections.push(spacing);
      currentListTypes.push('numbering');
    } else if (token.type === 'bullet_list_open') {
      sections.push(spacing);
      currentListTypes.push('bullet');
    } else if (token.type === 'list_item_open') {
      if (tokens[i + 1]?.type === 'paragraph_open') {
        i += 1;
      }
      if (tokens[i + 1]?.type === 'inline') {
        const currentListType = currentListTypes[currentListTypes.length - 1];
        const children = processInlineTokens(tokens[i + 1]?.children ?? []);
        sections.push(
          new Paragraph({
            children,
            numbering:
              currentListType === 'numbering'
                ? { reference: 'dgptNumbering', level: currentListTypes.length - 1 }
                : { reference: 'dgptBullet', level: currentListTypes.length - 1 },
            run: { size: fontSize },
          }),
        );
        i += 1;
      }
    } else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      sections.push(spacing);
      currentListTypes.pop();
    } else if (token.type === 'table_open') {
      currentTableRows = [];
      sections.push(spacing);
    } else if (token.type === 'tr_open') {
      currentTableCells = [];
    } else if (token.type === 'td_open' || token.type === 'th_open') {
      if (tokens[i + 1]?.type === 'inline') {
        const children = processInlineTokens(tokens[i + 1]?.children ?? []);
        currentTableCells.push(
          new TableCell({
            children: [new Paragraph({ children })],
          }),
        );
        i += 1;
      }
    } else if (token.type === 'tr_close') {
      currentTableRows.push(
        new TableRow({
          children: currentTableCells,
        }),
      );
      currentTableCells = [];
    } else if (token.type === 'table_close') {
      const table = new Table({
        rows: currentTableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        alignment: AlignmentType.CENTER,
        style: 'TableGrid',
      });
      sections.push(table);
      sections.push(spacing);
      currentTableRows = [];
    } else if (token.type === 'thead_open') {
      continue;
    } else if (token.tag === 'code') {
      // TODO TD-969: Plots are skipped for now, the export gets adapted later.
      if (token.info?.trim().split(/\s+/)[0] === PLOT_LANGUAGE) {
        continue;
      }
      const codeContent = tokens[i]?.content;
      const lines = codeContent?.split('\n') ?? [];
      const tokenInfo = token.info ?? '';
      sections.push(spacing);
      addCodingLanguage(sections, tokenInfo);
      const codeRow = createCodeBlock(lines);
      sections.push(
        new Table({
          rows: [codeRow],
          width: { size: 100, type: WidthType.PERCENTAGE },
          style: 'TableGrid',
        }),
      );
      sections.push(spacing);
    } else if (token.type === 'inline') {
      const children = processInlineTokens(token.children ?? []);
      sections.push(new Paragraph({ children }));
    }
  }

  return sections;
}

function fromNumberToHeadingLevel(level: number): IParagraphPropertiesOptions['heading'] {
  if (level === 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  if (level === 3) return HeadingLevel.HEADING_3;
  if (level === 4) return HeadingLevel.HEADING_4;
  if (level === 5) return HeadingLevel.HEADING_5;
  if (level === 6) return HeadingLevel.HEADING_6;

  return HeadingLevel.TITLE;
}
