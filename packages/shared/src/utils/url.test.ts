import { describe, expect, it } from 'vitest';

import { getDisplayUrl, normalizeDomain, parseHyperlinks } from './url';

describe('parseHyperlinks', () => {
  it('should return undefined for content without URLs', () => {
    expect(parseHyperlinks('Hello world')).toBeUndefined();
    expect(parseHyperlinks('')).toBeUndefined();
  });

  it('should return undefined for file: URLs', () => {
    expect(parseHyperlinks('file://localhost/etc/fstab')).toBeUndefined();
    expect(parseHyperlinks('file:///C:/path/to/file.txt')).toBeUndefined();
  });

  it('should return undefined for data: URLs', () => {
    expect(parseHyperlinks('data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==')).toBeUndefined();
    expect(parseHyperlinks('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA')).toBeUndefined();
  });

  it('should parse simple HTTP URLs', () => {
    const result = parseHyperlinks('Check out http://example.com');
    expect(result).toEqual(['http://example.com']);
  });

  it('should parse simple HTTPS URLs', () => {
    const result = parseHyperlinks('Check out https://example.com');
    expect(result).toEqual(['https://example.com']);
  });

  it('should parse URLs with capital letters', () => {
    const result = parseHyperlinks('Visit HTTPS://WWW.EXAMPLE.COM');
    expect(result).toEqual(['HTTPS://WWW.EXAMPLE.COM']);
  });

  it('should parse URLs with www prefix', () => {
    const result = parseHyperlinks('Visit https://www.example.com');
    expect(result).toEqual(['https://www.example.com']);
  });

  it('should parse URLs with paths', () => {
    const result = parseHyperlinks('See https://example.com/path/to/page');
    expect(result).toEqual(['https://example.com/path/to/page']);
  });

  it('should parse URLs with query parameters', () => {
    const result = parseHyperlinks('Link: https://example.com/search?q=hello&page=1');
    expect(result).toEqual(['https://example.com/search?q=hello&page=1']);
  });

  it('should parse URLs with fragments', () => {
    const result = parseHyperlinks('Go to https://example.com/page#section');
    expect(result).toEqual(['https://example.com/page#section']);
  });

  it('should parse URLs with multi-part TLDs like .co.uk', () => {
    const result = parseHyperlinks('Visit https://example.co.uk');
    expect(result).toEqual(['https://example.co.uk']);
  });

  it('should parse URLs with subdomains', () => {
    const result = parseHyperlinks('API at https://api.example.com/v1');
    expect(result).toEqual(['https://api.example.com/v1']);
  });

  it('should parse multiple URLs from content', () => {
    const content = 'Check https://first.com and http://second.org for more info';
    const result = parseHyperlinks(content);
    expect(result).toEqual(['https://first.com', 'http://second.org']);
  });

  it('should parse URLs with special characters in path', () => {
    const result = parseHyperlinks('File at https://example.com/file(1).pdf');
    expect(result).toEqual(['https://example.com/file(1).pdf']);
  });

  it('should parse URLs with @ symbol', () => {
    const result = parseHyperlinks('Profile: https://example.com/@username');
    expect(result).toEqual(['https://example.com/@username']);
  });

  it('should parse URLs with encoded characters', () => {
    const result = parseHyperlinks('Search: https://example.com/search?q=hello%20world');
    expect(result).toEqual(['https://example.com/search?q=hello%20world']);
  });
});

describe('getDisplayUrl', () => {
  it('should strip https:// prefix', () => {
    expect(getDisplayUrl('https://example.com')).toBe('example.com');
  });

  it('should strip http:// prefix', () => {
    expect(getDisplayUrl('http://example.com')).toBe('example.com');
  });

  it('should strip url prefix with capital letters', () => {
    expect(getDisplayUrl('HTTP://EXAMPLE.COM')).toBe('example.com');
  });

  it('should strip https://www. prefix', () => {
    expect(getDisplayUrl('https://www.example.com')).toBe('example.com');
  });

  it('should strip http://www. prefix', () => {
    expect(getDisplayUrl('http://www.example.com')).toBe('example.com');
  });

  it('should return empty string for empty input', () => {
    expect(getDisplayUrl('')).toBe('');
  });

  it('should preserve paths after stripping prefix', () => {
    expect(getDisplayUrl('https://example.com/path')).toBe('example.com/path');
  });
});

describe('normalizeDomain', () => {
  it('should return null for empty or whitespace-only input', () => {
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('   ')).toBeNull();
  });

  it('should accept a bare domain', () => {
    expect(normalizeDomain('example.com')).toBe('example.com');
  });

  it('should lowercase the domain', () => {
    expect(normalizeDomain('EXAMPLE.COM')).toBe('example.com');
  });

  it('should strip a leading www.', () => {
    expect(normalizeDomain('www.example.com')).toBe('example.com');
    expect(normalizeDomain('https://www.example.com')).toBe('example.com');
  });

  it('should strip scheme, path, query and fragment', () => {
    expect(normalizeDomain('https://example.com/some/path?q=1#frag')).toBe('example.com');
    expect(normalizeDomain('http://example.com/')).toBe('example.com');
  });

  it('should preserve non-www subdomains', () => {
    expect(normalizeDomain('api.example.com')).toBe('api.example.com');
    expect(normalizeDomain('https://api.example.com/v1')).toBe('api.example.com');
  });

  it('should support multi-part TLDs', () => {
    expect(normalizeDomain('example.co.uk')).toBe('example.co.uk');
    expect(normalizeDomain('www.example.co.uk')).toBe('example.co.uk');
  });

  it('should trim surrounding whitespace', () => {
    expect(normalizeDomain('  example.com  ')).toBe('example.com');
  });

  it('should return null for inputs without a TLD', () => {
    expect(normalizeDomain('example')).toBeNull();
    expect(normalizeDomain('localhost')).toBeNull();
  });

  it('should return null for inputs with invalid host characters', () => {
    expect(normalizeDomain('exa mple.com')).toBeNull();
    expect(normalizeDomain('example .com')).toBeNull();
  });

  it('should return null for non-http schemes', () => {
    expect(normalizeDomain('ftp://example.com')).toBeNull();
    expect(normalizeDomain('file:///etc/hosts')).toBeNull();
  });
});
