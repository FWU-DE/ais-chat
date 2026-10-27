import {
  filesDoNotBelongToAnyUser,
  sharedChatFileOwnershipBySession,
  sharedSessionIdIsNotEmpty,
} from '@shared/shared-chat/shared-chat-verify';
import { describe, expect, it } from 'vitest';

describe('sharedSessionIdIsNotEmpty', () => {
  it('throws when shared session id is undefined', () => {
    expect(() => sharedSessionIdIsNotEmpty(undefined)).toThrow(
      'Not authorized to use uploaded files',
    );
  });

  it('throws when shared session id is blank', () => {
    expect(() => sharedSessionIdIsNotEmpty('   ')).toThrow('Not authorized to use uploaded files');
  });

  it('accepts a non-empty session id', () => {
    expect(() => sharedSessionIdIsNotEmpty('session-1')).not.toThrow();
  });
});

describe('filesDoNotBelongToAnyUser', () => {
  it('throws when at least one file belongs to a user', () => {
    expect(() => filesDoNotBelongToAnyUser([{ userId: null }, { userId: 'user-1' }])).toThrow(
      'Not authorized to use one or more files',
    );
  });

  it('allows files that do not belong to any user', () => {
    expect(() => filesDoNotBelongToAnyUser([{ userId: null }])).not.toThrow();
  });
});

describe('sharedChatFileOwnershipBySession', () => {
  const context = {
    inviteCode: 'invite-1',
    entityType: 'character' as const,
    entityId: 'character-1',
    sharedSessionId: 'session-1' as const,
  };

  it('accepts files with matching ownership metadata', () => {
    const files = [
      {
        metadata: {
          inviteCode: 'invite-1',
          entityType: 'character',
          entityId: 'character-1',
          sessionId: 'session-1',
        },
      },
    ];

    expect(() => sharedChatFileOwnershipBySession({ files, ...context })).not.toThrow();
  });

  it('throws when metadata does not match context/session', () => {
    const files = [
      {
        metadata: {
          inviteCode: 'invite-1',
          entityType: 'character',
          entityId: 'character-1',
          sessionId: 'other-session',
        },
      },
    ];

    expect(() => sharedChatFileOwnershipBySession({ files, ...context })).toThrow(
      'Not authorized to access this file',
    );
  });

  it('throws when metadata is null', () => {
    const files = [{ metadata: null }];

    expect(() => sharedChatFileOwnershipBySession({ files, ...context })).toThrow(
      'Not authorized to access this file',
    );
  });
});
