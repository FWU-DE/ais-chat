import { describe, expect, it } from 'vitest';
import { validateFileExtension } from './generic';

describe('validateFileExtension', () => {
  it('accepts configured extensions regardless of filename casing', () => {
    expect(validateFileExtension('document.PDF', ['pdf'])).toBe(true);
  });

  it('rejects missing and unsupported extensions', () => {
    expect(validateFileExtension('document', ['pdf'])).toBe(false);
    expect(validateFileExtension('document.exe', ['pdf'])).toBe(false);
  });

  it('rejects a filename that matches an allowed extension but has no extension itself', () => {
    expect(validateFileExtension('pdf', ['pdf'])).toBe(false);
  });
});
