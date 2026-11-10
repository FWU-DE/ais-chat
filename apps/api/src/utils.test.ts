import { describe, expect, it } from 'vitest';

import { withErrorHandling } from './utils';

describe('withErrorHandling', () => {
  it('returns [null, data] on success', async () => {
    const [error, data] = await withErrorHandling(() => Promise.resolve(42));
    expect(error).toBeNull();
    expect(data).toBe(42);
  });

  it('returns [Error, null] when the async function throws an Error', async () => {
    const [error, data] = await withErrorHandling(() => Promise.reject(new Error('boom')));
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toBe('boom');
  });

  it('wraps non-Error thrown values into an Error', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const [error, data] = await withErrorHandling(() => Promise.reject('string error'));
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toBe('string error');
  });
});
