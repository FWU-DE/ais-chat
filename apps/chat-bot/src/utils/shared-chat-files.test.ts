import { describe, expect, it } from 'vitest';

import { addExportFlag, getSharedChatImageUrl } from './shared-chat-files';

describe('addExportFlag', () => {
  it('appends the export flag to a shared-chat image URL', () => {
    const url = getSharedChatImageUrl({
      fileId: 'file-1',
      inviteCode: 'code',
      entityType: 'character',
      entityId: 'entity-1',
      sharedSessionId: 'session-1',
    });

    const parsed = new URL(addExportFlag(url), 'http://localhost');

    expect(parsed.pathname).toBe('/api/v1/shared-chat/files/file-1/scaled-image');
    expect(parsed.searchParams.get('export')).toBe('true');
    expect(parsed.searchParams.get('sharedSessionId')).toBe('session-1');
  });

  it('starts the query string when the URL has none', () => {
    expect(addExportFlag('/api/v1/shared-chat/files/file-1/scaled-image')).toBe(
      '/api/v1/shared-chat/files/file-1/scaled-image?export=true',
    );
  });
});
