import { describe, it, expect } from 'vitest';
import { getCodeTitle } from './code-blocks';

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
