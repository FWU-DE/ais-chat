import { describe, expect, test } from 'vitest';

import { BifrostProviderSyncError } from './error';
import { assertBifrostResponse } from './http';

describe('assertBifrostResponse', () => {
  test('throws a sync error that carries the HTTP status but not the response body', async () => {
    const response = new Response('{"error":"secret detail"}', { status: 409 });

    const error = await assertBifrostResponse(Promise.resolve(response)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BifrostProviderSyncError);
    expect((error as BifrostProviderSyncError).status).toBe(409);
    expect(JSON.stringify(error)).not.toContain('secret detail');
  });
});
