import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from 'next-auth';
import { ForbiddenError, UnauthenticatedError } from '@shared/error';
import { ADMIN_ROLE, EDITOR_ROLE } from './roles';

const { authMock, setUserMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  setUserMock: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('@sentry/nextjs', () => ({ setUser: setUserMock }));

import { requireAdminOrEditorAuth, requireAdminAuth } from './requireAdminAuth';

function createSession(adminRole: Session['adminRole']): Session {
  return {
    adminRole,
    user: {
      id: 'user-id',
      name: 'Test User',
      email: 'test@example.com',
    },
    expires: '2099-01-01T00:00:00.000Z',
  };
}

describe('admin authorization guards', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated session', async () => {
    authMock.mockResolvedValue(null);

    await expect(requireAdminAuth()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects an authenticated user without an admin role', async () => {
    authMock.mockResolvedValue(createSession(undefined));

    await expect(requireAdminOrEditorAuth()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows an Editor to access the app administration only', async () => {
    const editorSession = createSession(EDITOR_ROLE);
    authMock.mockResolvedValue(editorSession);

    await expect(requireAdminOrEditorAuth()).resolves.toBe(editorSession);
    await expect(requireAdminAuth()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows an Admin to access all administrative areas and records the user', async () => {
    const adminSession = createSession(ADMIN_ROLE);
    authMock.mockResolvedValue(adminSession);

    await expect(requireAdminAuth()).resolves.toBe(adminSession);
    expect(setUserMock).toHaveBeenCalledWith({
      id: 'user-id',
      email: 'test@example.com',
      username: 'Test User',
    });
  });
});
