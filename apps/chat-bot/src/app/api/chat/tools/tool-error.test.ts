import { describe, expect, it } from 'vitest';
import { legacyToolErrorSchema } from './tool-error';

describe('legacyToolErrorSchema', () => {
  it('normalizes a bare legacy error string into an error object', () => {
    expect(legacyToolErrorSchema.safeParse('Error: Something failed.')).toEqual({
      success: true,
      data: { error: 'Error: Something failed.' },
    });
  });

  it('accepts the current { error } shape', () => {
    const result = legacyToolErrorSchema.safeParse({ error: 'Missing search query.' });
    expect(result).toEqual({ success: true, data: { error: 'Missing search query.' } });
  });

  it('keeps extra properties from legacy mixed-shape error objects instead of dropping them', () => {
    const legacyShape = {
      results: [],
      retriedWithoutFilters: false,
      error: 'No MUNDO results found.',
    };

    const result = legacyToolErrorSchema.safeParse(legacyShape);
    expect(result).toEqual({ success: true, data: legacyShape });
  });

  it('rejects objects without a string or null error field', () => {
    expect(legacyToolErrorSchema.safeParse({ result: '4' }).success).toBe(false);
    expect(legacyToolErrorSchema.safeParse({ error: 42 }).success).toBe(false);
  });

  it('turns a legacy math_calculate success shape into a success result without the stale error', () => {
    const legacyShape = { status: 'success', result: '4', error: null };

    const result = legacyToolErrorSchema.safeParse(legacyShape);
    expect(result).toEqual({
      success: true,
      data: { status: 'success', result: '4' },
    });
  });

  it('turns a legacy truncated-with-error shape into a success result with a notice', () => {
    const legacyShape = {
      fileName: 'report.pdf',
      content: 'truncated content',
      truncated: true,
      characterCount: 5000,
      maxCharacters: 1000,
      error: 'File content was truncated to fit the character limit.',
    };

    const result = legacyToolErrorSchema.safeParse(legacyShape);
    expect(result).toEqual({
      success: true,
      data: {
        fileName: 'report.pdf',
        content: 'truncated content',
        characterCount: 5000,
        maxCharacters: 1000,
        notice: 'File content was truncated to fit the character limit.',
      },
    });
  });

  it('turns a legacy retrieve_text_chunks empty-result shape into a success result with a notice', () => {
    const legacyShape = { chunks: [], error: 'No matching chunks found.' };

    const result = legacyToolErrorSchema.safeParse(legacyShape);
    expect(result).toEqual({
      success: true,
      data: { chunks: [], notice: 'No matching chunks found.' },
    });
  });

  it('keeps a shape with non-empty chunks classified as an error', () => {
    const legacyShape = {
      chunks: [{ fileName: 'a.pdf', orderIndex: 0, content: 'text' }],
      error: 'Something failed unexpectedly.',
    };

    const result = legacyToolErrorSchema.safeParse(legacyShape);
    expect(result).toEqual({ success: true, data: legacyShape });
  });

  it('keeps a legacy non-truncated shape classified as an error', () => {
    const legacyShape = {
      fileName: 'report.pdf',
      content: null,
      truncated: false,
      characterCount: 0,
      maxCharacters: 1000,
      error: 'No usable content found.',
    };

    const result = legacyToolErrorSchema.safeParse(legacyShape);
    expect(result).toEqual({ success: true, data: legacyShape });
  });
});
