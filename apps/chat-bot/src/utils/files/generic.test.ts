import { describe, expect, it } from 'vitest';
import {
  getFileExtension,
  isImageFile,
  parseSupportedFileExtension,
  validateFileExtension,
} from './generic';

describe('parseSupportedFileExtension', () => {
  it('normalises casing', () => {
    expect(parseSupportedFileExtension('document.PDF')).toBe('pdf');
  });

  it('returns undefined for unsupported and missing extensions', () => {
    expect(parseSupportedFileExtension('payload.exe')).toBeUndefined();
    expect(parseSupportedFileExtension('document')).toBeUndefined();
  });

  it('only considers the trailing extension', () => {
    expect(parseSupportedFileExtension('image.png.exe')).toBeUndefined();
    expect(parseSupportedFileExtension('archive.tar.gz')).toBeUndefined();
  });
});

describe('getFileExtension', () => {
  it('returns the normalised extension', () => {
    expect(getFileExtension('document.PDF')).toBe('pdf');
  });

  it('throws for an unsupported extension', () => {
    expect(() => getFileExtension('payload.exe')).toThrow();
  });
});

describe('isImageFile', () => {
  it('recognises supported image extensions regardless of casing', () => {
    expect(isImageFile('PHOTO.PNG')).toBe(true);
  });

  it('returns false for documents and unsupported extensions', () => {
    expect(isImageFile('report.pdf')).toBe(false);
    expect(isImageFile('payload.exe')).toBe(false);
    expect(isImageFile('noextension')).toBe(false);
  });
});

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
