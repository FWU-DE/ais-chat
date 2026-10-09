import { describe, it, expect } from 'vitest';
import { getCodeTitle, PLOT_LANGUAGE, replacePlotBlocks } from './code-blocks';

describe('getCodeTitle', () => {
  it('reads a title in double quotes', () => {
    expect(getCodeTitle('title="Ein Titel"')).toBe('Ein Titel');
  });

  it('reads a title in single quotes', () => {
    expect(getCodeTitle("title='Einfach'")).toBe('Einfach');
  });

  it('reads the title between other meta attributes', () => {
    expect(getCodeTitle('{1,3} title="x" showLineNumbers')).toBe('x');
  });

  it('accepts any whitespace before the attribute', () => {
    expect(getCodeTitle('\ttitle="x"')).toBe('x');
    expect(getCodeTitle('showLineNumbers   title="x"')).toBe('x');
  });

  it('trims the title', () => {
    expect(getCodeTitle('title="  x  "')).toBe('x');
  });

  it('returns undefined for an empty title', () => {
    expect(getCodeTitle('title=""')).toBeUndefined();
    expect(getCodeTitle('title="   "')).toBeUndefined();
  });

  it('returns undefined without meta or title', () => {
    expect(getCodeTitle(undefined)).toBeUndefined();
    expect(getCodeTitle('')).toBeUndefined();
    expect(getCodeTitle('{1,3} showLineNumbers')).toBeUndefined();
  });

  it('ignores unquoted values', () => {
    expect(getCodeTitle('title=ohne')).toBeUndefined();
  });

  it('ignores other attributes such as filename', () => {
    expect(getCodeTitle('filename="demo.js"')).toBeUndefined();
  });

  it('ignores attributes that only end with title', () => {
    expect(getCodeTitle('subtitle="x"')).toBeUndefined();
    expect(getCodeTitle('data-title="x"')).toBeUndefined();
    expect(getCodeTitle('not-title="x"')).toBeUndefined();
  });

  it('still finds the title next to an attribute that only ends with title', () => {
    expect(getCodeTitle('data-title="wrong.js" title="right.js"')).toBe('right.js');
  });
});

describe('replacePlotBlocks', () => {
  const describePlot = (title?: string) => (title ? `Grafik: ${title}` : 'Grafik');
  const plot = (info = '') => `\`\`\`${PLOT_LANGUAGE}${info}\n{"elements":[]}\n\`\`\``;

  it('replaces a plot block with its title', () => {
    const markdown = `Vorher\n\n${plot(' title="Sinus"')}\n\nNachher`;
    expect(replacePlotBlocks(markdown, describePlot)).toBe('Vorher\n\nGrafik: Sinus\n\nNachher');
  });

  it('describes a plot block without a title', () => {
    expect(replacePlotBlocks(plot(), describePlot)).toBe('Grafik');
  });

  it('replaces every plot block', () => {
    const markdown = `${plot(' title="A"')}\n\nText\n\n${plot(' title="B"')}`;
    expect(replacePlotBlocks(markdown, describePlot)).toBe('Grafik: A\n\nText\n\nGrafik: B');
  });

  it('keeps other code blocks and text unchanged', () => {
    const markdown = '```js title="demo.js"\nconst a = 1;\n```\n\n- Punkt\n- Ende';
    expect(replacePlotBlocks(markdown, describePlot)).toBe(markdown);
  });

  it('only replaces the plot block between other code blocks', () => {
    const code = '```py\nx = 1\n```';
    expect(replacePlotBlocks(`${code}\n\n${plot(' title="A"')}\n\n${code}`, describePlot)).toBe(
      `${code}\n\nGrafik: A\n\n${code}`,
    );
  });

  it('does not recognize the former language name', () => {
    const markdown = '```plot title="Alt"\n{}\n```';
    expect(replacePlotBlocks(markdown, describePlot)).toBe(markdown);
  });

  it('replaces a block that is not closed yet', () => {
    expect(replacePlotBlocks('Text\n\n```jsxgraph-json title="A"\n{"elem', describePlot)).toBe(
      'Text\n\nGrafik: A',
    );
  });

  it('replaces a plot block inside a list item, preserving its indentation', () => {
    const markdown = `- Punkt\n\n  ${plot(' title="A"').replaceAll('\n', '\n  ')}\n\n- Ende`;
    const result = replacePlotBlocks(markdown, describePlot);
    expect(result).toContain('\n  Grafik: A');
    expect(result).not.toContain(PLOT_LANGUAGE);
    expect(result).toContain('- Ende');
  });

  it('replaces a plot block inside a blockquote, preserving its prefix', () => {
    const markdown = `> ${plot(' title="A"').replaceAll('\n', '\n> ')}`;
    expect(replacePlotBlocks(markdown, describePlot)).toBe('> Grafik: A');
  });

  it('takes the title from the info string, not from the JSON', () => {
    const markdown = `\`\`\`${PLOT_LANGUAGE}\n{"title":"Aus JSON"}\n\`\`\``;
    expect(replacePlotBlocks(markdown, describePlot)).toBe('Grafik');
  });
});
