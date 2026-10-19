import { TextRun } from 'docx';
import { Math as DocxMath, latexToMath } from 'docx/math';
import MarkdownIt from 'markdown-it';

const fontSize = 22;

export type Token = ReturnType<InstanceType<typeof MarkdownIt>['parse']>[number];
export type InlineChild = TextRun | DocxMath;

function isMathFormula(value: string) {
  return /\\[a-zA-Z]+|[=^_]/.test(value);
}

function normalizeLatexBraces(latex: string) {
  return latex.replace(/(?<!\\left)\\\{/g, '\\left\\{').replace(/(?<!\\right)\\\}/g, '\\right\\}');
}

export function normalizeMathDelimiters(markdown: string) {
  let normalized = markdown
    .replace(
      /\\\[([\s\S]*?)\\\]/g,
      (_, latex: string) => `$$${latex.replace(/\s+/g, ' ').trim()}$$`,
    )
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, latex: string) => `$${latex.replace(/\s+/g, ' ').trim()}$`);

  normalized = normalized.replace(/\[([^\]\n]+)\](?!\()/g, (match, latex: string) => {
    return isMathFormula(latex) ? `$${latex}$` : match;
  });

  return normalized;
}

export function createMathChild(latex: string, display: boolean): InlineChild {
  try {
    return new DocxMath({ children: latexToMath(normalizeLatexBraces(latex)) });
  } catch {
    return new TextRun({
      text: `${display ? '$$' : '$'}${latex}${display ? '$$' : '$'}`,
      size: fontSize,
    });
  }
}

function findClosingDelimiter(value: string, start: number, delimiter: string) {
  for (let index = start; index <= value.length - delimiter.length; index += 1) {
    if (value[index] === '\\') {
      index += 1;
      continue;
    }
    if (value.startsWith(delimiter, index)) return index;
  }
  return -1;
}

export function processMathTextToken(
  value: string,
  options?: { bold?: boolean; italics?: boolean },
): InlineChild[] {
  const runs: InlineChild[] = [];
  let textStart = 0;
  let index = 0;

  const pushText = (end: number) => {
    if (end > textStart) {
      runs.push(new TextRun({ text: value.slice(textStart, end), size: fontSize, ...options }));
    }
  };

  while (index < value.length) {
    const delimiter = value.startsWith('$$', index)
      ? { close: '$$', length: 2, display: true }
      : value[index] === '$' && value[index - 1] !== '\\'
        ? { close: '$', length: 1, display: false }
        : undefined;

    if (delimiter === undefined) {
      index += 1;
      continue;
    }

    const closeIndex = findClosingDelimiter(value, index + delimiter.length, delimiter.close);
    if (closeIndex === -1) {
      index += delimiter.length;
      continue;
    }

    const prefix = value.slice(textStart, index);
    pushText(index);
    if (prefix.length > 0 && !/\s$/.test(prefix)) {
      runs.push(new TextRun({ text: ' ', size: fontSize }));
    }
    runs.push(
      createMathChild(value.slice(index + delimiter.length, closeIndex), delimiter.display),
    );
    index = closeIndex + delimiter.close.length;
    textStart = index;
  }

  pushText(value.length);
  return runs;
}
