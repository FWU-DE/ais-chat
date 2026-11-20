import { describe, expect, it } from 'vitest';

import { getSharedChatImageUrl } from './shared-chat-files';

describe('getSharedChatImageUrl', () => {
  it('appends the export flag to a shared-chat image URL', () => {
    const url = getSharedChatImageUrl({
      fileId: 'file-1',
      inviteCode: 'code',
      entityType: 'character',
      entityId: 'entity-1',
      sharedSessionId: 'session-1',
      forExport: true,
    });

    const parsed = new URL(url, 'http://localhost');

    expect(parsed.pathname).toBe('/api/v1/shared-chat/files/file-1/scaled-image');
    expect(parsed.searchParams.get('export')).toBe('true');
    expect(parsed.searchParams.get('sharedSessionId')).toBe('session-1');
  });
});
