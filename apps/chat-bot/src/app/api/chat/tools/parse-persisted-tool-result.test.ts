import { describe, expect, it } from 'vitest';
import {
  parseGenericPersistedToolResult,
  parsePersistedToolResultContent,
} from './parse-persisted-tool-result';

describe('parseGenericPersistedToolResult', () => {
  it('passes a bare array through unchanged (e.g. web_scraper)', () => {
    const raw = [{ url: 'https://example.com', content: 'text' }];
    expect(parseGenericPersistedToolResult(raw)).toEqual(raw);
  });

  it('normalizes a bare legacy error string into `{ error }`', () => {
    expect(parseGenericPersistedToolResult('Something failed.')).toEqual({
      error: 'Something failed.',
    });
  });

  it('passes the current `{ error }` shape through unchanged', () => {
    expect(parseGenericPersistedToolResult({ error: 'Something failed.' })).toEqual({
      error: 'Something failed.',
    });
  });

  it('keeps extra properties alongside the current `{ error }` shape', () => {
    expect(
      parseGenericPersistedToolResult({ error: 'File not found.', fileName: 'a.txt' }),
    ).toEqual({ error: 'File not found.', fileName: 'a.txt' });
  });

  it('passes a plain success object with no `error` key through unchanged', () => {
    const raw = { results: [], retriedWithoutFilters: false };
    expect(parseGenericPersistedToolResult(raw)).toEqual(raw);
  });

  it.each([
    ['null', null],
    ['a number', 42],
    ['undefined', undefined],
    ['a boolean', true],
  ])('returns undefined for unparseable input (%s)', (_, raw) => {
    expect(parseGenericPersistedToolResult(raw)).toBeUndefined();
  });
});

describe('parsePersistedToolResultContent', () => {
  it('parses valid JSON content', () => {
    expect(parsePersistedToolResultContent('{"error":"boom"}')).toEqual({ error: 'boom' });
  });

  it('returns undefined for invalid JSON content', () => {
    expect(parsePersistedToolResultContent('not json')).toBeUndefined();
  });
});
