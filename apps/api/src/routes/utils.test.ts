import { describe, expect, it, vi } from 'vitest';

vi.mock('@ais-chat/api-database', () => ({
  dbValidateApiKey: vi.fn(),
}));

import {
  getContentFilterFailedChunk,
  getErrorChunk,
  getMaybeBearerToken,
  isErrorWithStatus,
} from './utils';

describe('getMaybeBearerToken', () => {
  it('returns undefined when authorization header is undefined', () => {
    expect(getMaybeBearerToken(undefined)).toBeUndefined();
  });

  it('returns undefined when header does not start with Bearer', () => {
    expect(getMaybeBearerToken('Basic abc123')).toBeUndefined();
  });

  it('extracts token from a valid Bearer header', () => {
    expect(getMaybeBearerToken('Bearer my-secret-token')).toBe('my-secret-token');
  });

  it('returns empty string for "Bearer " with no token', () => {
    expect(getMaybeBearerToken('Bearer ')).toBe('');
  });
});

describe('getContentFilterFailedChunk', () => {
  it('returns a chunk with content_filter finish reason', () => {
    const chunk = getContentFilterFailedChunk({ id: 'c1', created: 1000, model: 'gpt-4' });
    expect(chunk.id).toBe('c1');
    expect(chunk.created).toBe(1000);
    expect(chunk.model).toBe('gpt-4');
    expect(chunk.object).toBe('chat.completion.chunk');
    expect(chunk.choices[0]!.finish_reason).toBe('content_filter');
    expect(chunk.choices[0]!.delta.content).toContain('unangemessener Inhalte');
  });
});

describe('getErrorChunk', () => {
  it('returns a chunk with error details', () => {
    const chunk = getErrorChunk({
      id: 'e1',
      created: 2000,
      model: 'gpt-4',
      errorMessage: 'timeout',
      errorCode: 'TIMEOUT',
    });
    expect(chunk.choices[0]!.delta.content).toContain('timeout');
    expect(chunk.choices[0]!.finish_reason).toBe('stop');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((chunk as any).error).toEqual({
      message: 'timeout',
      code: 'TIMEOUT',
      type: 'error',
    });
  });

  it('defaults errorCode to unknown_error', () => {
    const chunk = getErrorChunk({ id: 'e2', created: 3000, model: 'gpt-4', errorMessage: 'oops' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((chunk as any).error).toEqual(expect.objectContaining({ code: 'unknown_error' }));
  });
});

describe('isErrorWithStatus', () => {
  it('returns false for plain Error without status', () => {
    expect(isErrorWithStatus(new Error('test'))).toBe(false);
  });

  it('returns true for Error with numeric status property', () => {
    const err = Object.assign(new Error('not found'), { status: 404 });
    expect(isErrorWithStatus(err)).toBe(true);
  });

  it('returns false for non-Error values', () => {
    expect(isErrorWithStatus('string')).toBe(false);
    expect(isErrorWithStatus(null)).toBe(false);
  });
});
